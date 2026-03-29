import { NextRequest, NextResponse } from "next/server";

/** POST /api/settings/verify
 * Body: { password: string }
 * Returns 200 { ok: true } if password matches SETTINGS_PASSWORD env var.
 * Used by both the login-page gear modal and the runner settings gear modal.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const submitted = body?.password ?? "";
  const expected = process.env.SETTINGS_PASSWORD ?? "Agco2022!";

  if (!submitted || submitted !== expected) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
