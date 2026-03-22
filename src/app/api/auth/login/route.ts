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
  const submitted = body?.password ?? "";
  const expected = process.env.APP_PASSWORD ?? "";

  if (!expected || submitted !== expected) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const value = await cookieValue();
  const response = NextResponse.json({ ok: true });
  response.cookies.set("auth_session", value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
  });
  return response;
}
