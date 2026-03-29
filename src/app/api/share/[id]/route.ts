import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

/**
 * GET /api/share/[id]
 * Public (no auth) read-only endpoint for sharing a run with Claude Code.
 * Returns all diagnostic data needed to analyse a run: steps, URLs, durations, errors.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { rows } = await sql`
    SELECT
      r.id,
      r.status,
      r.result_json,
      r.order_ids,
      r.created_at,
      r.finished_at,
      s.name  AS scenario_name,
      s.vins,
      s.gc_options
    FROM test_runs r
    JOIN scenarios s ON r.scenario_id = s.id
    WHERE r.id = ${id}
  `;

  if (rows.length === 0) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const run = rows[0];

  // Build a human-readable summary for Claude to parse easily
  const durationMs = run.finished_at
    ? new Date(run.finished_at).getTime() - new Date(run.created_at).getTime()
    : null;

  return NextResponse.json({
    run_id: run.id,
    scenario: run.scenario_name,
    status: run.status,
    started_at: run.created_at,
    finished_at: run.finished_at,
    duration_ms: durationMs,
    vins: (run.vins as string[]).map((vin: string, i: number) => ({
      vin,
      gc_option: (run.gc_options as string[])[i] ?? "Standard",
    })),
    steps: run.result_json ?? [],
    order_ids: run.order_ids ?? {},
  });
}
