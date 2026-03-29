import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

/**
 * GET /api/settings/login-defaults?environment=Prod&brand=FT&country=US
 * Returns the stored username/password for the given combination.
 * Public (no auth required) — called by the login page to pre-fill credentials.
 *
 * GET /api/settings/login-defaults (no params)
 * Returns all stored combinations as an array.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const environment = searchParams.get("environment");
  const brand = searchParams.get("brand");
  const country = searchParams.get("country");

  if (environment && brand && country) {
    const { rows } = await sql`
      SELECT * FROM login_defaults
      WHERE environment = ${environment} AND brand = ${brand} AND country = ${country}
    `;
    return NextResponse.json(rows[0] ?? { cpq_username: "", cpq_password: "" });
  }

  // Return all saved combinations
  const { rows } = await sql`SELECT * FROM login_defaults ORDER BY environment, brand, country`;
  return NextResponse.json(rows);
}

/**
 * PUT /api/settings/login-defaults
 * Body: { password, environment, brand, country, cpq_username, cpq_password }
 * Upserts credentials for the given combination.
 * Requires admin password (SETTINGS_PASSWORD).
 */
export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const expected = process.env.SETTINGS_PASSWORD ?? "Agco2022!";

  if (!body.password || body.password !== expected) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const { environment, brand, country, cpq_username, cpq_password } = body;

  if (!environment || !brand || !country) {
    return NextResponse.json({ error: "environment, brand, and country are required" }, { status: 400 });
  }

  await sql`
    INSERT INTO login_defaults (environment, brand, country, cpq_username, cpq_password)
    VALUES (${environment}, ${brand}, ${country}, ${cpq_username ?? ""}, ${cpq_password ?? ""})
    ON CONFLICT (environment, brand, country)
    DO UPDATE SET
      cpq_username = EXCLUDED.cpq_username,
      cpq_password = EXCLUDED.cpq_password
  `;

  return NextResponse.json({ ok: true });
}
