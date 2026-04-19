-- ============================================================
-- CPQ NA Webtester — Database Schema
-- ============================================================

-- Singleton row: runner settings (persists across logout)
CREATE TABLE IF NOT EXISTS app_settings (
  id               INTEGER PRIMARY KEY DEFAULT 1,
  gc_default       TEXT    NOT NULL DEFAULT 'Standard',       -- Annual | Standard | Parts-Only
  annual_duration  INTEGER NOT NULL DEFAULT 60,               -- 12 | 24 | 36 | 48 | 60
  svc_preset       TEXT    NOT NULL DEFAULT 'Minimum',        -- Minimum | Medium | Maximum
  stage_endpoint   TEXT    NOT NULL DEFAULT 'Configuration',  -- Configuration | Order
  show_svc_column  BOOLEAN NOT NULL DEFAULT false,            -- show Service Condition column in Scenarios form
  CONSTRAINT app_settings_single_row CHECK (id = 1)
);
INSERT INTO app_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
-- New columns added after initial deploy (idempotent)
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS show_svc_column BOOLEAN NOT NULL DEFAULT false;

-- Login defaults: one row per Environment+Brand+Country combination (up to 8 rows)
-- Pre-fills the login form when the user selects a specific combination
CREATE TABLE IF NOT EXISTS login_defaults (
  environment  TEXT NOT NULL,   -- Prod | Stage
  brand        TEXT NOT NULL,   -- FT | MF
  country      TEXT NOT NULL,   -- US | CA
  cpq_username TEXT NOT NULL DEFAULT '',
  cpq_password TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (environment, brand, country)
);

-- Scenarios: one entry per saved test configuration
-- gc_options is parallel to vins (same index = same VIN)
CREATE TABLE IF NOT EXISTS scenarios (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  vins        TEXT[] NOT NULL,
  gc_options  TEXT[] NOT NULL,  -- Annual | Standard | Parts-Only, one per VIN
  svc_options TEXT[],           -- per-VIN: duration string ("60") for Annual, preset ("Minimum") for Standard/Parts-Only
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS svc_options TEXT[];

-- Test runs: one entry per triggered test execution
CREATE TABLE IF NOT EXISTS test_runs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id      UUID NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  environment      TEXT NOT NULL,   -- Prod | Stage
  brand            TEXT NOT NULL,   -- FT | MF
  country          TEXT NOT NULL,   -- US | CA
  status           TEXT NOT NULL DEFAULT 'pending',  -- pending | complete | failed
  result_json      JSONB,           -- step-by-step pass/fail per VIN
  screenshot_url   TEXT,            -- Vercel Blob URL (failure screenshot)
  pdf_url          TEXT,            -- Vercel Blob URL (zipped PDFs)
  pdf_text         TEXT,            -- extracted PDF text (future)
  performance_json JSONB,           -- Core Web Vitals (future)
  order_ids        JSONB,           -- map: VIN -> order ID or "config test only"
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  finished_at      TIMESTAMP WITH TIME ZONE
);

-- Auto-delete runs older than 30 days (handled in application layer)

-- Analysis snapshots: saved AI analysis results with cross-check tracking
CREATE TABLE IF NOT EXISTS analysis_snapshots (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  run_count            INTEGER NOT NULL,
  overall_failure_rate DECIMAL(5,4) NOT NULL,
  failing_steps        JSONB NOT NULL,   -- [{stepName, failureRate, failures, totalRuns}]
  suggestion_text      TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'pending',  -- pending | implementing | verified | dismissed
  notes                TEXT
);

-- Lessons learned: human-curated registry of failure patterns and their fixes (legacy)
CREATE TABLE IF NOT EXISTS lessons_learned (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  step_name    TEXT,            -- normalised step name (without [VIN] prefix), or null = applies to all
  brand        TEXT,            -- FT | MF | null = all
  country      TEXT,            -- US | CA | null = all
  gc_option    TEXT,            -- Standard | Annual | Parts-Only | null = all
  root_cause   TEXT NOT NULL,
  fix_applied  TEXT,
  status       TEXT NOT NULL DEFAULT 'resolved',  -- open | resolved
  run_id       UUID REFERENCES test_runs(id) ON DELETE SET NULL,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at  TIMESTAMP WITH TIME ZONE
);
