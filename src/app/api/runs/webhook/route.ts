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
  const webhookSecret = process.env.WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!safeEqual(token, webhookSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    type?: string;
    run_id: string;
    step?: unknown;
    status?: string;
    result_json?: unknown;
    screenshot_url?: string;
    pdf_url?: string;
    pdf_text?: string;
    performance_json?: unknown;
    order_ids?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.run_id) {
    return NextResponse.json({ error: "run_id is required" }, { status: 400 });
  }

  // ── PDF retry complete — merge PDF step results into existing result_json ─────
  if (body.type === "pdf_retry_complete") {
    const { run_id, pdf_url } = body;
    const vin = (body as Record<string, unknown>).vin as string | undefined;
    const newSteps = ((body as Record<string, unknown>).steps as Record<string, unknown>[] | undefined) ?? [];

    const { rows: runRows } = await sql`SELECT result_json, pdf_url FROM test_runs WHERE id = ${run_id}`;
    if (runRows.length === 0) return NextResponse.json({ error: "Run not found" }, { status: 404 });

    const existing = (runRows[0].result_json ?? []) as Record<string, unknown>[];

    // Replace matching steps (same vin + same step name); append if not found
    const merged = [...existing];
    for (const ns of newSteps) {
      const idx = merged.findIndex(s => s.vin === vin && s.step === ns.step);
      if (idx >= 0) {
        merged[idx] = ns;
      } else {
        merged.push(ns);
      }
    }

    // Keep existing pdf_url if no new one was uploaded
    const finalPdfUrl = pdf_url ?? runRows[0].pdf_url ?? null;

    await sql`
      UPDATE test_runs SET
        result_json = ${JSON.stringify(merged)}::jsonb,
        pdf_url     = ${finalPdfUrl}
      WHERE id = ${run_id}
    `;
    return NextResponse.json({ ok: true });
  }

  // ── Incremental step update ───────────────────────────────────────────────────
  if (body.type === "step" && body.step != null) {
    const { rows: existing } = await sql`SELECT status FROM test_runs WHERE id = ${body.run_id}`;
    if (existing.length === 0) return NextResponse.json({ error: "Run not found" }, { status: 404 });
    if (existing[0].status === "stopped") return NextResponse.json({ ok: true, skipped: true });

    await sql`
      UPDATE test_runs
      SET result_json = COALESCE(result_json, '[]'::jsonb) || ${JSON.stringify([body.step])}::jsonb
      WHERE id = ${body.run_id} AND status = 'pending'
    `;
    return NextResponse.json({ ok: true });
  }

  // ── Final result ──────────────────────────────────────────────────────────────
  const { run_id, status, result_json, screenshot_url, pdf_url, pdf_text, performance_json, order_ids } = body;

  if (!status) {
    return NextResponse.json({ error: "status is required" }, { status: 400 });
  }

  const allowed = ["complete", "failed"];
  if (!allowed.includes(status)) {
    return NextResponse.json({ error: `status must be one of: ${allowed.join(", ")}` }, { status: 400 });
  }

  const { rows: existing } = await sql`SELECT id, status FROM test_runs WHERE id = ${run_id}`;
  if (existing.length === 0) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  if (existing[0].status === "stopped") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const { rows } = await sql`
    UPDATE test_runs SET
      status           = ${status},
      result_json      = ${result_json != null ? JSON.stringify(result_json) : null},
      screenshot_url   = ${screenshot_url ?? null},
      pdf_url          = ${pdf_url ?? null},
      pdf_text         = ${pdf_text ?? null},
      performance_json = ${performance_json != null ? JSON.stringify(performance_json) : null},
      order_ids        = ${order_ids != null ? JSON.stringify(order_ids) : null},
      finished_at      = NOW()
    WHERE id = ${run_id}
    RETURNING *
  `;

  return NextResponse.json(rows[0]);
}
