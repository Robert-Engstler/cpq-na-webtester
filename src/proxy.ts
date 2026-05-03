import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/api/auth", "/api/runs/webhook", "/api/settings/verify", "/api/settings/login-defaults", "/api/share"];

// Returns the client IP from Vercel's forwarded header
function getClientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "";
}

// Converts an IPv4 address string to a 32-bit integer
function ipToInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) | parseInt(octet, 10), 0) >>> 0;
}

// Checks whether `ip` matches an entry which may be a plain IP or a CIDR range
function ipMatches(ip: string, entry: string): boolean {
  if (!entry.includes("/")) return ip === entry;
  const [network, bits] = entry.split("/");
  const mask = bits === "0" ? 0 : (~0 << (32 - parseInt(bits, 10))) >>> 0;
  return (ipToInt(ip) & mask) === (ipToInt(network) & mask);
}

function isAllowed(ip: string): boolean {
  if (!ip || ip === "127.0.0.1" || ip === "::1") return true; // local dev
  const raw = process.env.ALLOWED_IPS ?? "";
  if (!raw.trim()) return true; // no allowlist configured → open
  const entries = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return entries.some((entry) => ipMatches(ip, entry));
}

async function expectedCookieValue(): Promise<string> {
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

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const ip = getClientIp(request);
  if (!isAllowed(ip)) {
    return new NextResponse("Chuck Norris once got a 403. The server apologized. You won't get the same courtesy.", { status: 403 });
  }

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get("auth_session");
  const expected = await expectedCookieValue();

  if (cookie?.value === expected) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
