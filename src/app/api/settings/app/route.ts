import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

/** GET /api/settings/app
 * Returns the current runner settings (requires session auth via middleware).
 */
export async function GET() {
  const { rows } = await sql`SELECT * FROM app_settings WHERE id = 1`;
  return NextResponse.json(rows[0] ?? {});
}

/** PUT /api/settings/app
 * Body: { gc_default, annual_duration, svc_preset, stage_endpoint }
 * Requires session auth only (no admin password).
 */
export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  const { gc_default, annual_duration, svc_preset, stage_endpoint, show_svc_column } = body;

  const validGc = ["Annual", "Standard", "Parts-Only"];
  const validDurations = [12, 24, 36, 48, 60];
  const validPresets = ["Minimum", "Medium", "Maximum"];
  const validEndpoints = ["Configuration", "Order"];

  if (gc_default && !validGc.includes(gc_default)) {
    return NextResponse.json({ error: "Invalid gc_default" }, { status: 400 });
  }
  if (annual_duration !== undefined && !validDurations.includes(Number(annual_duration))) {
    return NextResponse.json({ error: "Invalid annual_duration" }, { status: 400 });
  }
  if (svc_preset && !validPresets.includes(svc_preset)) {
    return NextResponse.json({ error: "Invalid svc_preset" }, { status: 400 });
  }
  if (stage_endpoint && !validEndpoints.includes(stage_endpoint)) {
    return NextResponse.json({ error: "Invalid stage_endpoint" }, { status: 400 });
  }

  const showSvc = show_svc_column != null ? Boolean(show_svc_column) : null;

  await sql`
    UPDATE app_settings SET
      gc_default       = COALESCE(${gc_default ?? null}, gc_default),
      annual_duration  = COALESCE(${annual_duration != null ? Number(annual_duration) : null}, annual_duration),
      svc_preset       = COALESCE(${svc_preset ?? null}, svc_preset),
      stage_endpoint   = COALESCE(${stage_endpoint ?? null}, stage_endpoint),
      show_svc_column  = COALESCE(${showSvc}, show_svc_column)
    WHERE id = 1
  `;

  return NextResponse.json({ ok: true });
}
