import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { rows: existing } = await sql`SELECT status FROM test_runs WHERE id = ${id}`;
  if (existing.length === 0) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  if (existing[0].status !== "pending") {
    return NextResponse.json({ error: "Only pending runs can be stopped" }, { status: 409 });
  }

  const { rows } = await sql`
    UPDATE test_runs SET status = 'stopped', finished_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;

  return NextResponse.json(rows[0]);
}
