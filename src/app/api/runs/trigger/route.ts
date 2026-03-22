import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { scenarioId } = body;

  if (!scenarioId) {
    return NextResponse.json({ error: "scenarioId is required" }, { status: 400 });
  }

  // Look up the scenario
  const { rows: scenarioRows } = await sql`
    SELECT * FROM scenarios WHERE id = ${scenarioId}
  `;
  if (scenarioRows.length === 0) {
    return NextResponse.json({ error: "Scenario not found" }, { status: 404 });
  }
  const scenario = scenarioRows[0];

  // Check env vars before doing anything else
  const githubToken = process.env.GITHUB_TOKEN;
  const githubRepo = process.env.GITHUB_REPO; // format: "owner/repo"
  if (!githubToken || !githubRepo) {
    return NextResponse.json(
      { error: "GITHUB_TOKEN and GITHUB_REPO are not configured" },
      { status: 500 }
    );
  }

  // Create a pending test_run record
  const { rows: runRows } = await sql`
    INSERT INTO test_runs (scenario_id, status)
    VALUES (${scenarioId}, 'pending')
    RETURNING *
  `;
  const run = runRows[0];

  // Trigger the GitHub Actions workflow, passing VIN, language, and run ID as inputs
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
          vins: scenario.vins.join(","),
          language: scenario.language,
          run_id: run.id,
        },
      }),
    }
  );

  if (!githubRes.ok) {
    const errorText = await githubRes.text();
    // Clean up the orphaned pending run
    await sql`DELETE FROM test_runs WHERE id = ${run.id}`;
    return NextResponse.json(
      { error: `GitHub API error ${githubRes.status}: ${errorText}` },
      { status: 502 }
    );
  }

  // Set created_at now that the dispatch succeeded — this is when the timer starts
  const { rows: updatedRows } = await sql`
    UPDATE test_runs SET created_at = NOW() WHERE id = ${run.id} RETURNING *
  `;

  return NextResponse.json(updatedRows[0], { status: 201 });
}
