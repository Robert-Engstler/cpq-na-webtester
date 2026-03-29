import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  const clear = { httpOnly: true, maxAge: 0, path: "/" };
  response.cookies.set("auth_session", "", clear);
  response.cookies.set("session_ctx", "", clear);
  return response;
}
