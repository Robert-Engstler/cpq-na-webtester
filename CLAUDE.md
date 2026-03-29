# CPQ Webtester — Claude Context

## What This Project Is
A Next.js web app (hosted on Vercel) that lets users run automated Playwright E2E tests against a CPQ (Configure, Price, Quote) website. Tests are parameterised by up to **5 VINs**, **Environment** (Prod/Stage), **Brand** (FT/MF), and **Country** (US/CA), triggered from the UI, executed via GitHub Actions, and results are reported back in real time.

## Tech Stack
- **Frontend/Backend**: Next.js (App Router, TypeScript)
- **Styling**: Tailwind CSS 4
- **Database**: Neon PostgreSQL via `@vercel/postgres`
- **File Storage**: Vercel Blob (PDFs zipped per-run)
- **Test Execution**: GitHub Actions + Playwright
- **Auth**: Single-password, HMAC-SHA256 session cookie (no user accounts)

## Project Status
**Core loop fully complete and deployed.** All Phase 1 work is done. See PLAN.md for the full feature history.

## Project Structure
```
src/
  app/
    (app)/                          # Auth-protected routes
      layout.tsx                    # App shell with nav
      page.tsx                      # Redirects to /scenarios
      scenarios/page.tsx            # Scenarios list + Add Scenario form
      runs/page.tsx                 # Runs list with status, VIN colors, Config IDs
    runs/[id]/page.tsx              # Run Details page (opens in new tab, no nav)
    mock/page.tsx                   # Static design reference (/mock)
    api/
      auth/login/route.ts           # POST — password login, sets cookie
      auth/logout/route.ts          # POST — clears cookie
      db/migrate/route.ts           # POST — initialises DB schema
      scenarios/route.ts            # GET (list) + POST (create) scenarios
      scenarios/[id]/route.ts       # DELETE scenario
      runs/route.ts                 # GET (list) + DELETE all runs
      runs/[id]/route.ts            # GET (single) + DELETE single run
      runs/trigger/route.ts         # POST — triggers GitHub Actions workflow_dispatch
      runs/webhook/route.ts         # POST — receives results from GitHub Actions
      settings/app/route.ts         # GET + POST — app settings (singleton row)
      settings/login-defaults/route.ts  # GET + POST — per env/brand/country credentials
      settings/verify/route.ts      # POST — verify admin password
  components/
    nav.tsx                         # Nav bar with Settings modal trigger
    AppSettingsModal.tsx            # Settings modal (app config + login defaults)
  lib/
    db.ts                           # Vercel Postgres SQL client
    design.ts                       # Design tokens (dark theme, colors, fonts)
    cpq-urls.ts                     # CPQ URL helpers
    session.ts                      # Session/auth helpers
  proxy.ts                          # Auth middleware (protects all routes)
db/schema.sql                       # DB schema definition
scripts/migrate.mjs                 # DB migration script
tests/
  cpq-na-test.mjs                   # Main NA Playwright E2E test script
  cpq-test.mjs                      # Playwright test script (alternate/earlier version)
.github/workflows/test.yml          # GitHub Actions workflow (workflow_dispatch)
PLAN.md                             # Full project roadmap and feature history
```

## Database Schema

### `app_settings` (singleton — always exactly 1 row)
| Column | Type | Description |
|---|---|---|
| id | INTEGER | Always 1 |
| gc_default | TEXT | Annual \| Standard \| Parts-Only |
| annual_duration | INTEGER | 12 \| 24 \| 36 \| 48 \| 60 |
| svc_preset | TEXT | Minimum \| Medium \| Maximum |
| stage_endpoint | TEXT | Configuration \| Order |

### `login_defaults` (up to 8 rows — one per env/brand/country combo)
| Column | Type | Description |
|---|---|---|
| environment | TEXT | Prod \| Stage |
| brand | TEXT | FT \| MF |
| country | TEXT | US \| CA |
| cpq_username | TEXT | Pre-filled login username |
| cpq_password | TEXT | Pre-filled login password |

### `scenarios`
| Column | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| name | TEXT | User-defined scenario name |
| vins | TEXT[] | Vehicle Identification Numbers (1–5) |
| gc_options | TEXT[] | Annual \| Standard \| Parts-Only, one per VIN (parallel to vins) |
| created_at | TIMESTAMP | Creation date |

### `test_runs`
| Column | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| scenario_id | UUID | FK → scenarios (cascade delete) |
| environment | TEXT | Prod \| Stage |
| brand | TEXT | FT \| MF |
| country | TEXT | US \| CA |
| status | TEXT | pending \| complete \| failed |
| result_json | JSONB | Step-by-step pass/fail per VIN |
| screenshot_url | TEXT | Vercel Blob URL (failure screenshot) |
| pdf_url | TEXT | Vercel Blob URL (zipped PDFs) |
| pdf_text | TEXT | Extracted PDF text (future) |
| performance_json | JSONB | Core Web Vitals (future) |
| order_ids | JSONB | Map: VIN → order ID or "config test only" |
| created_at | TIMESTAMP | Run start time |
| finished_at | TIMESTAMP | Run end time (set by webhook) |

Auto-delete: runs and scenarios older than 30 days deleted on every GET /api/scenarios and GET /api/runs.

## API Routes (All Implemented)
- `POST /api/auth/login` — body: `{ password }`, sets `auth_session` cookie
- `POST /api/auth/logout` — clears cookie
- `POST /api/db/migrate` — creates/updates tables
- `GET /api/scenarios` — list all scenarios (newest first, triggers 30-day cleanup)
- `POST /api/scenarios` — create scenario, body: `{ name, vins: string[], gc_options: string[] }`
- `DELETE /api/scenarios/[id]` — delete scenario + cascade test_runs
- `GET /api/runs` — list runs (optional `?scenario_id=` filter, triggers 30-day cleanup)
- `DELETE /api/runs` — delete all runs (optional `?scenario_id=` filter)
- `GET /api/runs/[id]` — get single run
- `DELETE /api/runs/[id]` — delete single run
- `POST /api/runs/trigger` — trigger GitHub Actions workflow_dispatch, creates pending run
- `POST /api/runs/webhook` — receives results from GitHub Actions (public, HMAC-validated)
- `GET /api/settings/app` — get app settings
- `POST /api/settings/app` — update app settings (requires admin password)
- `GET /api/settings/login-defaults` — get all login defaults
- `POST /api/settings/login-defaults` — upsert a login default row (requires admin password)
- `POST /api/settings/verify` — verify admin password

## Auth / Middleware
- `src/proxy.ts` — middleware checks `auth_session` cookie on all routes
- Public paths: `/login`, `/api/auth/*`, `/api/runs/webhook`
- Cookie: HMAC-SHA256 signed, HTTPOnly, 7-day expiry
- Two passwords: `APP_PASSWORD` (general access), `ADMIN_PASSWORD` (settings changes)

## Key Env Vars (.env.local — committed to repo)
- `APP_PASSWORD` — login password
- `ADMIN_PASSWORD` — settings/admin password
- `AUTH_SECRET` — HMAC key for session cookie
- `DATABASE_URL` — Neon PostgreSQL connection string
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob access token
- `GITHUB_TOKEN` — for triggering GitHub Actions
- `GITHUB_REPO` — `Robert-Engstler/cpq-na-webtester`
- `WEBHOOK_SECRET` — HMAC secret for validating GitHub Actions POSTs

## UI Design
- Dark monospace theme throughout: bg `#0d0d0d`, JetBrains Mono, design tokens in `src/lib/design.ts`
- All pages use viewport-height no-scroll layout (5 rows per page, paginated)
- Run Details opens in new tab (no nav bar)
- VIN color coding: green (all pre-populated) / yellow (manual spec selection needed) / red (step failed) / gray (pending/no data)
- Animated RUNNING badge (left-to-right fill sweep)
- Live ticking duration counter while run is active, freezes on completion
- Auto-refresh polling every 5s while any run is pending

## Parked / Future Phases
- **Phase 2**: Failure screenshots — Blob upload + inline display (Blob infra done, display pending)
- **Phase 3**: PDF text extraction — `pdf-parse`, collapsible section in run details
- **Phase 4**: Results UI polish — live log streaming, re-run button, comparison view, filters, "Run All"
- **Phase 5**: Performance metrics — Core Web Vitals, trend charts, thresholds
- **Phase 6**: Auto VIN fetching from Redshift

*Last updated: 29 March 2026*
