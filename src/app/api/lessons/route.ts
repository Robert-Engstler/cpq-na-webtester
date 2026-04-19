import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS lessons_learned (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title       TEXT NOT NULL,
        step_name   TEXT,
        brand       TEXT,
        country     TEXT,
        gc_option   TEXT,
        root_cause  TEXT NOT NULL,
        fix_applied TEXT,
        status      TEXT NOT NULL DEFAULT 'resolved',
        run_id      UUID REFERENCES test_runs(id) ON DELETE SET NULL,
        created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        resolved_at TIMESTAMP WITH TIME ZONE
      )
    `;
    const { rows } = await sql`
      SELECT l.*, r.brand AS run_brand, r.country AS run_country, r.created_at AS run_created_at
      FROM lessons_learned l
      LEFT JOIN test_runs r ON r.id = l.run_id
      ORDER BY l.created_at DESC
    `;
    return NextResponse.json(rows);
  } catch (err) {
    console.error("[GET /api/lessons]", err);
    return NextResponse.json({ error: "Failed to fetch lessons" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let body: {
    title: string;
    step_name?: string;
    brand?: string;
    country?: string;
    gc_option?: string;
    root_cause: string;
    fix_applied?: string;
    status?: string;
    run_id?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.title?.trim() || !body.root_cause?.trim()) {
    return NextResponse.json({ error: "title and root_cause are required" }, { status: 400 });
  }
  try {
    const { rows } = await sql`
      INSERT INTO lessons_learned (title, step_name, brand, country, gc_option, root_cause, fix_applied, status, run_id, resolved_at)
      VALUES (
        ${body.title.trim()},
        ${body.step_name?.trim() || null},
        ${body.brand || null},
        ${body.country || null},
        ${body.gc_option || null},
        ${body.root_cause.trim()},
        ${body.fix_applied?.trim() || null},
        ${body.status || "resolved"},
        ${body.run_id || null},
        ${(body.status ?? "resolved") === "resolved" ? sql`NOW()` : null}
      )
      RETURNING *
    `;
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    console.error("[POST /api/lessons]", err);
    return NextResponse.json({ error: "Failed to create lesson" }, { status: 500 });
  }
}
