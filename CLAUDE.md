# CPQ Webtester — Claude Context

## What This Project Is
A Next.js web app (hosted on Vercel) that lets users run automated Playwright E2E tests against a CPQ (Configure, Price, Quote) website. Tests are parameterised by up to **5 VINs** and **Language**, triggered from the UI, executed via GitHub Actions, and results are reported back in real time.

## Tech Stack
- **Frontend/Backend**: Next.js 16 (App Router, TypeScript)
- **Styling**: Tailwind CSS 4
- **Database**: Neon PostgreSQL via `@vercel/postgres`
- **File Storage**: Vercel Blob (PDFs uploaded per-VIN, zipped per-run)
- **Test Execution**: GitHub Actions + Playwright
- **Auth**: Single-password, HMAC-SHA256 session cookie (no user accounts)

## Project Structure
```
src/
  app/
    (app)/                  # Auth-protected routes
      layout.tsx            # App shell with nav
      page.tsx              # Redirects to /scenarios
      scenarios/page.tsx    # PLACEHOLDER — needs full implementation
      runs/page.tsx         # PLACEHOLDER — needs full implementation
    api/
      auth/login/route.ts   # POST — password login, sets cookie
      auth/logout/route.ts  # POST — clears cookie
      db/migrate/route.ts   # POST — initialises DB schema
      scenarios/route.ts    # GET (list) + POST (create) scenarios
      scenarios/[id]/route.ts # DELETE scenario
    login/page.tsx          # Login page (functional)
    layout.tsx / globals.css
  components/nav.tsx        # Nav bar
  lib/db.ts                 # Vercel Postgres SQL client
  proxy.ts                  # Auth middleware (protects all routes)
db/schema.sql               # DB schema definition
scripts/migrate.mjs         # DB migration script
PLAN.md                     # Full 6-phase project roadmap
```

## Database Tables
- **scenarios**: `id` (UUID), `name`, `vins` (TEXT[], 1–5 VINs), `language` ("en"/"de"), `created_at`
- **test_runs**: `id`, `scenario_id` (FK → scenarios), `status` (pending/running/complete/failed), `result_json` (JSONB), `screenshot_url`, `pdf_url`, `pdf_text`, `performance_json` (JSONB), `created_at`

## API Routes (Implemented)
- `POST /api/auth/login` — body: `{ password }`, sets `auth_session` cookie
- `POST /api/auth/logout` — clears cookie
- `POST /api/db/migrate` — creates tables if not exist
- `GET /api/scenarios` — list all scenarios (newest first)
- `POST /api/scenarios` — create scenario, body: `{ name, vins: string[], language }`
- `DELETE /api/scenarios/[id]` — delete scenario + cascade test_runs

## API Routes (Planned)
- `POST /api/runs/trigger` — calls GitHub Actions `workflow_dispatch` with comma-joined VINs + language
- `GET /api/runs/[id]/status` — poll run status
- `POST /api/runs/webhook` — receives results from GitHub Actions, writes to DB

## Auth / Middleware
- `src/proxy.ts` — middleware that checks `auth_session` cookie on all routes
- Public paths: `/login`, `/api/auth/*`, `/api/runs/webhook` (for GitHub Actions)
- Cookie: HMAC-SHA256 signed, HTTPOnly, 7-day expiry
- Env vars: `APP_PASSWORD`, `AUTH_SECRET`

## Current Phase: Phase 1 (Core Loop) — Partially Done

### Completed
- Auth system
- DB schema + migration endpoint
- Scenarios CRUD API
- UI scaffold (login functional, nav, layout)

### Still To Build (Phase 1)
| Task | What |
|------|------|
| Scenarios UI | Form (name, VINs textarea, language) + table with Run/Delete buttons |
| `POST /api/runs/trigger` | Calls GitHub API `workflow_dispatch`, creates pending `test_run` record |
| `POST /api/runs/webhook` | Receives GitHub Actions results, validates HMAC secret, writes to DB |
| GitHub Actions workflow | `.github/workflows/test.yml` — `workflow_dispatch` with `vins` (comma-separated) + `language` inputs |
| Playwright script | Multi-VIN E2E test — login once, loop VINs, zip PDFs to Blob, POST results to webhook |
| Results UI | Run history list + step-by-step detail view per run |

### Future Phases (see PLAN.md)
- Phase 2: Failure screenshots → Vercel Blob
- Phase 3: PDF download + text extraction
- Phase 4: Results UI polish (polling, comparison view, filters)
- Phase 5: Performance metrics (Core Web Vitals)
- Phase 6: Auto VIN fetching from Redshift

## Key Env Vars (in .env.local)
- `APP_PASSWORD` — login password
- `AUTH_SECRET` — HMAC key for session cookie
- `DATABASE_URL` — Neon PostgreSQL connection string
- `GITHUB_TOKEN` — (to add) for triggering GitHub Actions
- `GITHUB_REPO` — (to add) owner/repo for workflow dispatch
- `WEBHOOK_SECRET` — (to add) HMAC secret for validating GitHub Actions POSTs

## CPQ Site Credentials (for local Playwright investigation)
- `TEST_USERNAME` = `cpqproddealeruk@gmail.com`
- `TEST_PASSWORD` = `Agco2022!`
- VIN in use = `VKKMB820VLB345030`

## Important Notes
- `.env.local` is committed to the repo — fine for now (internal tool), but worth noting
- Playwright script supports multi-VIN: login once, loop through VINs, zip all PDFs, upload to Blob
- GitHub Actions workflow passes `vins` (comma-separated) to the test script
- Language options are currently hardcoded as `"en"` and `"de"`
