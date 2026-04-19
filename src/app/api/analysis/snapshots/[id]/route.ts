import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { status?: string; notes?: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    const { rows } = await sql`
      UPDATE analysis_snapshots SET
        status = COALESCE(${body.status ?? null}, status),
        notes  = COALESCE(${body.notes !== undefined ? body.notes : null}, notes)
      WHERE id = ${id}
      RETURNING *
    `;
    if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error("[PATCH /api/analysis/snapshots/[id]]", err);
    return NextResponse.json({ error: "Failed to update snapshot" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { rows } = await sql`DELETE FROM analysis_snapshots WHERE id = ${id} RETURNING id`;
    if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/analysis/snapshots/[id]]", err);
    return NextResponse.json({ error: "Failed to delete snapshot" }, { status: 500 });
  }
}
