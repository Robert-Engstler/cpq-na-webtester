-- ============================================================
-- CPQ NA Webtester — Database Schema
-- ============================================================

-- Singleton row: runner settings (persists across logout)
CREATE TABLE IF NOT EXISTS app_settings (
  id              INTEGER PRIMARY KEY DEFAULT 1,
  gc_default      TEXT NOT NULL DEFAULT 'Standard',       -- Annual | Standard | Parts-Only
  annual_duration INTEGER NOT NULL DEFAULT 60,            -- 12 | 24 | 36 | 48 | 60
  svc_preset      TEXT NOT NULL DEFAULT 'Minimum',        -- Minimum | Medium | Maximum
  stage_endpoint  TEXT NOT NULL DEFAULT 'Configuration',  -- Configuration | Order
  CONSTRAINT app_settings_single_row CHECK (id = 1)
);
INSERT INTO app_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

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
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

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
