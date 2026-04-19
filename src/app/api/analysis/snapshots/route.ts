import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS analysis_snapshots (
      id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      run_count            INTEGER NOT NULL,
      overall_failure_rate DECIMAL(5,4) NOT NULL,
      failing_steps        JSONB NOT NULL,
      suggestion_text      TEXT NOT NULL,
      status               TEXT NOT NULL DEFAULT 'pending',
      notes                TEXT
    )
  `;
}

export async function GET() {
  try {
    await ensureTable();
    const { rows } = await sql`SELECT * FROM analysis_snapshots ORDER BY created_at DESC`;
    return NextResponse.json(rows);
  } catch (err) {
    console.error("[GET /api/analysis/snapshots]", err);
    return NextResponse.json({ error: "Failed to fetch snapshots" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let body: {
    run_count: number;
    overall_failure_rate: number;
    failing_steps: Array<{ stepName: string; failureRate: number; failures: number; totalRuns: number }>;
    suggestion_text: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    await ensureTable();
    const { rows } = await sql`
      INSERT INTO analysis_snapshots (run_count, overall_failure_rate, failing_steps, suggestion_text)
      VALUES (
        ${body.run_count},
        ${body.overall_failure_rate},
        ${JSON.stringify(body.failing_steps)}::jsonb,
        ${body.suggestion_text}
      )
      RETURNING *
    `;
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    console.error("[POST /api/analysis/snapshots]", err);
    return NextResponse.json({ error: "Failed to save snapshot" }, { status: 500 });
  }
}
