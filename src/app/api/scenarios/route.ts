import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

const VALID_GC = ["Annual", "Standard", "Parts-Only"];

export async function GET() {
  // Auto-delete scenarios (and cascaded runs) older than 30 days
  await sql`DELETE FROM scenarios WHERE created_at < NOW() - INTERVAL '30 days'`;

  const { rows } = await sql`SELECT * FROM scenarios ORDER BY created_at DESC`;
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, vins, gc_options } = body;

  if (!name || !vins || !gc_options) {
    return NextResponse.json({ error: "name, vins, and gc_options are required" }, { status: 400 });
  }
  if (!Array.isArray(vins) || vins.length === 0 || vins.length > 10) {
    return NextResponse.json({ error: "vins must be an array of 1–10 VINs" }, { status: 400 });
  }
  if (!Array.isArray(gc_options) || gc_options.length !== vins.length) {
    return NextResponse.json({ error: "gc_options must have the same length as vins" }, { status: 400 });
  }
  if (!gc_options.every((g: string) => VALID_GC.includes(g))) {
    return NextResponse.json({ error: "Each gc_option must be Annual, Standard, or Parts-Only" }, { status: 400 });
  }

  const cleaned = vins.map((v: string) => v.trim().toUpperCase()).filter(Boolean);
  if (cleaned.length === 0) {
    return NextResponse.json({ error: "At least one non-empty VIN is required" }, { status: 400 });
  }

  // @vercel/postgres sql`` doesn't accept JS arrays directly —
  // convert to Postgres array literal format: {val1,val2,...}
  const vinsLiteral = `{${cleaned.join(",")}}`;
  const gcLiteral = `{${gc_options.join(",")}}`;

  const { rows } = await sql`
    INSERT INTO scenarios (name, vins, gc_options)
    VALUES (${name}, ${vinsLiteral}::text[], ${gcLiteral}::text[])
    RETURNING *
  `;
  return NextResponse.json(rows[0], { status: 201 });
}
