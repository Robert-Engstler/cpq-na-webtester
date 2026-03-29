import { NextRequest, NextResponse } from "next/server";

async function cookieValue(): Promise<string> {
  const secret = process.env.AUTH_SECRET ?? "";
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode("authenticated")
  );
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  // Login is gated by CPQ credentials — any non-empty username + password is accepted.
  // The actual CPQ credentials are validated when the Playwright test runs.
  const cpqUsername = body?.cpq_username ?? "";
  const cpqPassword = body?.cpq_password ?? "";

  if (!cpqUsername || !cpqPassword) {
    return NextResponse.json({ error: "CPQ username and password are required" }, { status: 401 });
  }

  const value = await cookieValue();
  const response = NextResponse.json({ ok: true });

  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
  };

  // Auth session cookie (HMAC-signed)
  response.cookies.set("auth_session", value, cookieOpts);

  // Session context cookie: stores env/brand/country/username for use in API routes
  const sessionCtx = JSON.stringify({
    environment: body.environment ?? "Prod",
    brand: body.brand ?? "FT",
    country: body.country ?? "US",
    cpqUsername,
  });
  response.cookies.set("session_ctx", sessionCtx, cookieOpts);

  return response;
}
