import { sql } from "@vercel/postgres";

console.log("Running migration...");

await sql`
  CREATE TABLE IF NOT EXISTS scenarios (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    vin         TEXT NOT NULL,
    language    TEXT NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  )
`;
console.log("✓ scenarios table ready");

await sql`
  CREATE TABLE IF NOT EXISTS test_runs (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scenario_id      UUID NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
    status           TEXT NOT NULL DEFAULT 'pending',
    result_json      JSONB,
    screenshot_url   TEXT,
    pdf_url          TEXT,
    pdf_text         TEXT,
    performance_json JSONB,
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  )
`;
console.log("✓ test_runs table ready");

console.log("Migration complete.");
process.exit(0);
