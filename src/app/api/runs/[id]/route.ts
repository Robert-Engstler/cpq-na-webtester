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
      s.vins
    FROM test_runs r
    JOIN scenarios s ON r.scenario_id = s.id
    WHERE r.id = ${id}
  `;

  if (rows.length === 0) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  return NextResponse.json(rows[0]);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({})) as { vin?: string; orderId?: string };
  const { vin, orderId } = body;

  if (!vin || !orderId) {
    return NextResponse.json({ error: "vin and orderId are required" }, { status: 400 });
  }

  const { rows } = await sql`SELECT order_ids FROM test_runs WHERE id = ${id}`;
  if (rows.length === 0) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const existing = (rows[0].order_ids ?? {}) as Record<string, string>;
  const updated = { ...existing, [vin]: orderId };

  await sql`UPDATE test_runs SET order_ids = ${JSON.stringify(updated)}::jsonb WHERE id = ${id}`;

  return NextResponse.json({ ok: true });
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
