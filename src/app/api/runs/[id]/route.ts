import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { rows } = await sql`
    SELECT
      r.*,
      s.name  AS scenario_name,
      s.vins,
      s.language
    FROM test_runs r
    JOIN scenarios s ON r.scenario_id = s.id
    WHERE r.id = ${id}
  `;

  if (rows.length === 0) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  return NextResponse.json(rows[0]);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { rowCount } = await sql`DELETE FROM test_runs WHERE id = ${id}`;

  if (rowCount === 0) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  return NextResponse.json({ deleted: id });
}
