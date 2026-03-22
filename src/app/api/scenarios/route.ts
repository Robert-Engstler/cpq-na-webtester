import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET() {
  // Auto-delete scenarios (and cascaded runs) older than 30 days
  await sql`DELETE FROM scenarios WHERE created_at < NOW() - INTERVAL '30 days'`;

  const { rows } = await sql`SELECT * FROM scenarios ORDER BY created_at DESC`;
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, vins, language } = body;

  if (!name || !vins || !language) {
    return NextResponse.json({ error: "name, vins, and language are required" }, { status: 400 });
  }
  if (!Array.isArray(vins) || vins.length === 0 || vins.length > 5) {
    return NextResponse.json({ error: "vins must be an array of 1–5 VINs" }, { status: 400 });
  }
  const cleaned = vins.map((v: string) => v.trim().toUpperCase()).filter(Boolean);
  if (cleaned.length === 0) {
    return NextResponse.json({ error: "At least one non-empty VIN is required" }, { status: 400 });
  }
  if (!["en", "de"].includes(language)) {
    return NextResponse.json({ error: "language must be 'en' or 'de'" }, { status: 400 });
  }

  // @vercel/postgres sql`` doesn't accept JS arrays directly —
  // convert to Postgres array literal format: {val1,val2,...}
  const vinsLiteral = `{${cleaned.join(",")}}`;
  const { rows } = await sql`
    INSERT INTO scenarios (name, vins, language)
    VALUES (${name}, ${vinsLiteral}::text[], ${language})
    RETURNING *
  `;
  return NextResponse.json(rows[0], { status: 201 });
}
