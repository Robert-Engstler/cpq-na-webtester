import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { status?: string; notes?: string; action_items?: Array<{ id: string; text: string; status: string }> };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    if (body.status !== undefined) {
      await sql`UPDATE analysis_snapshots SET status = ${body.status} WHERE id = ${id}`;
    }
    if (body.notes !== undefined) {
      await sql`UPDATE analysis_snapshots SET notes = ${body.notes} WHERE id = ${id}`;
    }
    if (body.action_items !== undefined) {
      await sql`UPDATE analysis_snapshots SET action_items = ${JSON.stringify(body.action_items)}::jsonb WHERE id = ${id}`;
    }
    const { rows } = await sql`SELECT * FROM analysis_snapshots WHERE id = ${id}`;
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
