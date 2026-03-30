import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSessionContext } from "@/lib/session";
import { resolveCpqUrl } from "@/lib/cpq-urls";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { scenarioId } = body;

  if (!scenarioId) {
    return NextResponse.json({ error: "scenarioId is required" }, { status: 400 });
  }

  // Read session context (set at login)
  const ctx = getSessionContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "Session context missing — please log in again" }, { status: 401 });
  }

  // Look up the scenario
  const { rows: scenarioRows } = await sql`SELECT * FROM scenarios WHERE id = ${scenarioId}`;
  if (scenarioRows.length === 0) {
    return NextResponse.json({ error: "Scenario not found" }, { status: 404 });
  }
  const scenario = scenarioRows[0];

  // Check required env vars
  const githubToken = process.env.GITHUB_TOKEN;
  const githubRepo = process.env.GITHUB_REPO;
  if (!githubToken || !githubRepo) {
    return NextResponse.json({ error: "GITHUB_TOKEN and GITHUB_REPO are not configured" }, { status: 500 });
  }

  // Fetch runner settings
  const { rows: settingsRows } = await sql`SELECT * FROM app_settings WHERE id = 1`;
  const settings = settingsRows[0] ?? {
    gc_default: "Standard",
    annual_duration: 60,
    svc_preset: "Minimum",
    stage_endpoint: "Configuration",
  };

  // Resolve the CPQ URL from the session context
  const cpqUrl = resolveCpqUrl(ctx.environment, ctx.brand, ctx.country);
  if (!cpqUrl) {
    return NextResponse.json({ error: `No CPQ URL configured for ${ctx.environment}|${ctx.brand}|${ctx.country}` }, { status: 400 });
  }

  // Create a pending test_run record with environment context
  const { rows: runRows } = await sql`
    INSERT INTO test_runs (scenario_id, status, environment, brand, country)
    VALUES (${scenarioId}, 'pending', ${ctx.environment}, ${ctx.brand}, ${ctx.country})
    RETURNING *
  `;
  const run = runRows[0];

  // Dispatch GitHub Actions workflow with all NA inputs
  const githubRes = await fetch(
    `https://api.github.com/repos/${githubRepo}/actions/workflows/test.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: "main",
        inputs: {
          vins:            scenario.vins.join(","),
          gc_options:      scenario.gc_options.join(","),
          run_id:          run.id,
          environment:     ctx.environment,
          brand:           ctx.brand,
          country:         ctx.country,
          cpq_username:    ctx.cpqUsername,
          cpq_url:         cpqUrl,
          stage_endpoint:  settings.stage_endpoint,
          gc_default:      settings.gc_default,
          annual_duration: String(settings.annual_duration),
          svc_preset:      settings.svc_preset,
          svc_options:     scenario.svc_options ? (scenario.svc_options as string[]).join(",") : "",
        },
      }),
    }
  );

  if (!githubRes.ok) {
    const errorText = await githubRes.text();
    await sql`DELETE FROM test_runs WHERE id = ${run.id}`;
    return NextResponse.json(
      { error: `GitHub API error ${githubRes.status}: ${errorText}` },
      { status: 502 }
    );
  }

  // Reset created_at now that dispatch succeeded — this is when the timer starts
  const { rows: updatedRows } = await sql`
    UPDATE test_runs SET created_at = NOW() WHERE id = ${run.id} RETURNING *
  `;

  return NextResponse.json(updatedRows[0], { status: 201 });
}
