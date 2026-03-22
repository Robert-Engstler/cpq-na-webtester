import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET() {
  // Auto-delete orphaned runs older than 30 days (scenarios cascade, but just in case)
  await sql`DELETE FROM test_runs WHERE created_at < NOW() - INTERVAL '30 days'`;

  const { rows } = await sql`
    SELECT
      r.id,
      r.scenario_id,
      r.status,
      r.result_json,
      r.pdf_url,
      r.created_at,
      r.finished_at,
      s.name  AS scenario_name,
      s.vins,
      s.language
    FROM test_runs r
    JOIN scenarios s ON r.scenario_id = s.id
    ORDER BY r.created_at DESC
  `;
  return NextResponse.json(rows);
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const scenarioId = searchParams.get("scenario_id");

  if (scenarioId) {
    const { rowCount } = await sql`DELETE FROM test_runs WHERE scenario_id = ${scenarioId}`;
    return NextResponse.json({ deleted: rowCount });
  }

  const { rowCount } = await sql`DELETE FROM test_runs`;
  return NextResponse.json({ deleted: rowCount });
}
