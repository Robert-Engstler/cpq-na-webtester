import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { resolveCpqUrl } from "@/lib/cpq-urls";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({})) as { vin?: string };

  const { rows: runRows } = await sql`
    SELECT r.*, s.vins AS scenario_vins
    FROM test_runs r
    JOIN scenarios s ON r.scenario_id = s.id
    WHERE r.id = ${id}
  `;
  if (runRows.length === 0) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  const run = runRows[0];

  // Determine which VIN to retry
  const orderIds = (run.order_ids ?? {}) as Record<string, string>;
  const targetVin = body.vin ?? Object.keys(orderIds).find(v => {
    const oid = orderIds[v];
    return oid && oid !== "config test only" && oid !== "placed";
  });

  if (!targetVin) {
    return NextResponse.json({ error: "No VIN specified or found with a valid order ID" }, { status: 400 });
  }

  const orderId = orderIds[targetVin];
  if (!orderId || orderId === "config test only" || orderId === "placed") {
    return NextResponse.json({ error: `No valid order ID for VIN ${targetVin}` }, { status: 400 });
  }

  // Construct order URL
  const cpqBase = resolveCpqUrl(run.environment, run.brand, run.country);
  if (!cpqBase) {
    return NextResponse.json({ error: "Cannot resolve CPQ URL for this environment" }, { status: 400 });
  }
  const aftersalesBase = cpqBase.replace(/\/machineselection$/, "");
  const orderUrl = `${aftersalesBase}/asorder/${orderId}`;

  // Get credentials from login_defaults
  const { rows: credRows } = await sql`
    SELECT cpq_username FROM login_defaults
    WHERE environment = ${run.environment} AND brand = ${run.brand} AND country = ${run.country}
  `;
  if (credRows.length === 0) {
    return NextResponse.json({ error: "No login credentials configured for this environment" }, { status: 400 });
  }
  const cpqUsername = credRows[0].cpq_username;

  const githubToken = process.env.GITHUB_TOKEN;
  const githubRepo = process.env.GITHUB_REPO;
  if (!githubToken || !githubRepo) {
    return NextResponse.json({ error: "GitHub not configured" }, { status: 500 });
  }

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
          vins:          targetVin,
          gc_options:    "Parts-Only",
          run_id:        id,
          environment:   run.environment,
          brand:         run.brand,
          country:       run.country,
          cpq_username:  cpqUsername,
          cpq_url:       cpqBase,
          pdf_only:      "true",
          pdf_order_url: orderUrl,
          pdf_vin:       targetVin,
        },
      }),
    }
  );

  if (!githubRes.ok) {
    const errText = await githubRes.text();
    return NextResponse.json({ error: `GitHub API error ${githubRes.status}: ${errText}` }, { status: 502 });
  }

  return NextResponse.json({ ok: true, vin: targetVin, orderUrl });
}
