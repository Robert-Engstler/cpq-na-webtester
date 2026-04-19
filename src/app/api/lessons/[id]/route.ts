import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { rows } = await sql`DELETE FROM lessons_learned WHERE id = ${id} RETURNING id`;
    if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/lessons/[id]]", err);
    return NextResponse.json({ error: "Failed to delete lesson" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { status?: string; fix_applied?: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    const { rows } = await sql`
      UPDATE lessons_learned SET
        status      = COALESCE(${body.status ?? null}, status),
        fix_applied = COALESCE(${body.fix_applied ?? null}, fix_applied),
        resolved_at = CASE WHEN ${body.status ?? null} = 'resolved' THEN NOW() ELSE resolved_at END
      WHERE id = ${id}
      RETURNING *
    `;
    if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error("[PATCH /api/lessons/[id]]", err);
    return NextResponse.json({ error: "Failed to update lesson" }, { status: 500 });
  }
}
