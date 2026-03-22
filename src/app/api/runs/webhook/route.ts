import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

// Constant-time string comparison to prevent timing attacks
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function POST(request: NextRequest) {
  // Verify the shared secret sent by the Playwright script
  const webhookSecret = process.env.WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!safeEqual(token, webhookSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse payload
  let body: {
    run_id: string;
    status: string;
    result_json?: unknown;
    screenshot_url?: string;
    pdf_url?: string;
    pdf_text?: string;
    performance_json?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { run_id, status, result_json, screenshot_url, pdf_url, pdf_text, performance_json } = body;

  if (!run_id || !status) {
    return NextResponse.json({ error: "run_id and status are required" }, { status: 400 });
  }

  const allowed = ["complete", "failed"];
  if (!allowed.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${allowed.join(", ")}` },
      { status: 400 }
    );
  }

  // Confirm the run exists
  const { rows: existing } = await sql`SELECT id FROM test_runs WHERE id = ${run_id}`;
  if (existing.length === 0) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  // Write results
  const { rows } = await sql`
    UPDATE test_runs SET
      status           = ${status},
      result_json      = ${result_json != null ? JSON.stringify(result_json) : null},
      screenshot_url   = ${screenshot_url ?? null},
      pdf_url          = ${pdf_url ?? null},
      pdf_text         = ${pdf_text ?? null},
      performance_json = ${performance_json != null ? JSON.stringify(performance_json) : null},
      finished_at      = NOW()
    WHERE id = ${run_id}
    RETURNING *
  `;

  return NextResponse.json(rows[0]);
}
