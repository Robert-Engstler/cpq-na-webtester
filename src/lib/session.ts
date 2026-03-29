import { NextRequest } from "next/server";

export type SessionContext = {
  environment: string;  // Prod | Stage
  brand: string;        // FT | MF
  country: string;      // US | CA
  cpqUsername: string;
};

/**
 * Reads the session_ctx cookie set at login time.
 * Contains the CPQ environment/brand/country/username selected by the user.
 * Returns null if the cookie is missing or malformed.
 */
export function getSessionContext(request: NextRequest): SessionContext | null {
  const raw = request.cookies.get("session_ctx")?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SessionContext>;
    if (!parsed.environment || !parsed.brand || !parsed.country || !parsed.cpqUsername) {
      return null;
    }
    return parsed as SessionContext;
  } catch {
    return null;
  }
}
