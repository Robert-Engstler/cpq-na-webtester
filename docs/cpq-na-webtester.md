# CPQ NA Webtester — Technical & Functional Documentation

**Version:** 1.0
**Last updated:** 2026-03-27
**Author:** Robert Engstler
**Contact / Recovery:** robert.engstler@agcocorp.com · engstler-robert@gmx.de

---

## 1. Functional Overview

The CPQ NA Webtester is an automated end-to-end testing tool for AGCO's North American Configure-Price-Quote (CPQ) web application. It allows users to define test scenarios with up to 5 VINs and a Genuine Care service type per VIN, trigger fully automated browser-based test runs, and receive structured results including downloaded PDFs and (on Stage) order IDs.

**What it tests:**
The tool walks through the complete CPQ NA flow: VIN entry → Genuine Care selection → service specification → configuration saving. On Stage, it optionally continues to create a quotation and place an order.

**Who uses it:**
AGCO product and testing teams working with the North American CPQ (Fendt FT and Massey Ferguson MF, US and CA markets).

**What it produces:**
- Step-by-step pass/fail results per VIN
- Configuration IDs (from the CPQ URL after Save)
- Order IDs (Stage only, when "Order" end-point is selected)
- A ZIP file of downloaded PDFs: Parts Picklist, Service Checklist, and (Stage/Order) Genuine Care Order Details + Maintenance Agreement

---

## 2. Architecture & Tech Stack

| Layer | Technology |
|---|---|
| Frontend + Backend | Next.js 16 (App Router, TypeScript) |
| Styling | Tailwind CSS 4, dark monospace theme (JetBrains Mono) |
| Database | Neon PostgreSQL via `@vercel/postgres` |
| File Storage | Vercel Blob (PDFs zipped per run) |
| Test Execution | Playwright 1.58 (browser automation) |
| Test Orchestration | GitHub Actions (`workflow_dispatch`) |
| Authentication | Single-password HMAC-SHA256 session cookie |
| Hosting | Vercel (Next.js deployment) |

**Data flow:**
1. User logs in → selects environment/brand/country → session context stored in cookie
2. User creates scenarios (VINs + Genuine Care type per VIN)
3. User triggers a run → app dispatches GitHub Actions workflow with all parameters
4. GitHub Actions runner executes `tests/cpq-na-test.mjs` (Playwright)
5. Script navigates CPQ, downloads PDFs, zips them, uploads to Vercel Blob
6. Script POSTs results + PDF URL + order IDs to the webhook endpoint
7. Webhook writes to DB; frontend polls every 5 s until complete

---

## 3. URL Matrix

| Environment | Brand | Country | CPQ URL | Test User |
|---|---|---|---|---|
| Prod | FT (Fendt) | US | `https://cpq.agcocorp.com/fendt/dealer/en_US/aftersales/machineselection` | cpqtesten@gmail.com |
| Prod | FT (Fendt) | CA | `https://cpq.agcocorp.com/fendt/dealer/fr_CA/aftersales/machineselection` | cpqtestca@gmail.com |
| Prod | MF (Massey Ferguson) | US | `https://cpq.agcocorp.com/masseyferguson/dealer/en_US/aftersales/machineselection` | cpqtesten@gmail.com |
| Prod | MF (Massey Ferguson) | CA | `https://cpq.agcocorp.com/masseyferguson/dealer/fr_CA/aftersales/machineselection` | cpqtestca@gmail.com |
| Stage | FT (Fendt) | US | `https://www.cpq.staging.aws-ct.agcocorp.com/fendt/dealer/en_US/aftersales/machineselection` | lang.tester@langtest.com |
| Stage | FT (Fendt) | CA | `https://www.cpq.staging.aws-ct.agcocorp.com/fendt/dealer/fr_CA/aftersales/machineselection` | MAPLE.TESTER@MAPLETEST.COM |
| Stage | MF (Massey Ferguson) | US | `https://www.cpq.staging.aws-ct.agcocorp.com/masseyferguson/dealer/en_US/aftersales/machineselection` | lang.tester@langtest.com |
| Stage | MF (Massey Ferguson) | CA | `https://www.cpq.staging.aws-ct.agcocorp.com/masseyferguson/dealer/fr_CA/aftersales/machineselection` | MAPLE.TESTER@MAPLETEST.COM |

> CPQ passwords are stored in the GitHub Actions secret `CPQ_PASSWORDS` (JSON map keyed by `Env|Brand|Country`). They are never passed as workflow inputs to avoid appearing in GitHub Actions logs.

---

## 4. Authentication Model

The tool has three distinct password concepts:

| Password | Purpose | Where used |
|---|---|---|
| **Webtester Password** (`APP_PASSWORD`) | Gates access to the webtester web application | Login form (bottom field) |
| **CPQ Credentials** (username + password) | Logs into the CPQ site during test execution | Login form (CPQ Username / CPQ Password fields); passwords stored in GitHub secret |
| **Admin/Settings Password** (`SETTINGS_PASSWORD`, default: `Agco2022!`) | Allows changing webtester settings and login defaults | Gear icon on login page + gear icon in header |

**Session flow:**
- On login, the webtester password is verified. A signed `auth_session` cookie and a `session_ctx` cookie (containing environment/brand/country/cpqUsername) are set for 7 days.
- The `session_ctx` cookie is read at run-trigger time to determine which CPQ URL and environment to use.
- On logout, both cookies are cleared.

**Password recovery:**
Contact robert.engstler@agcocorp.com or engstler-robert@gmx.de to reset the settings password.

---

## 5. Database Schema

```sql
-- Runner settings (singleton, persists across logout)
app_settings:
  gc_default      TEXT    -- Annual | Standard | Parts-Only  (default: Standard)
  annual_duration INTEGER -- 12|24|36|48|60 months          (default: 60)
  svc_preset      TEXT    -- Minimum | Medium | Maximum      (default: Minimum)
  stage_endpoint  TEXT    -- Configuration | Order           (default: Configuration)

-- Login defaults (singleton, pre-fills login form)
login_defaults:
  environment  TEXT -- Prod | Stage
  brand        TEXT -- FT | MF
  country      TEXT -- US | CA
  cpq_username TEXT
  cpq_password TEXT -- stored for UI pre-fill only; actual automation uses GitHub secret

-- Test scenarios
scenarios:
  id          UUID      (primary key)
  name        TEXT      (user description)
  vins        TEXT[]    (1–5 VINs)
  gc_options  TEXT[]    (parallel to vins: Annual|Standard|Parts-Only per VIN)
  created_at  TIMESTAMPTZ

-- Test runs
test_runs:
  id               UUID
  scenario_id      UUID      (FK → scenarios, cascade delete)
  environment      TEXT      (Prod | Stage)
  brand            TEXT      (FT | MF)
  country          TEXT      (US | CA)
  status           TEXT      (pending | complete | failed)
  result_json      JSONB     (step-by-step pass/fail per VIN)
  screenshot_url   TEXT      (Vercel Blob URL, failure screenshots)
  pdf_url          TEXT      (Vercel Blob URL, ZIP of all PDFs)
  order_ids        JSONB     (map: VIN → order ID or "config test only")
  created_at       TIMESTAMPTZ
  finished_at      TIMESTAMPTZ
```

> Scenarios and runs older than 30 days are automatically deleted on each list request.

---

## 6. Login & Settings Configuration

### Login Page

Fields:
- **Environment** (dropdown): Prod / Stage
- **Brand** (dropdown): FT (Fendt) / MF (Massey Ferguson)
- **Country** (dropdown): US / CA
- **CPQ Username**: The CPQ login email used during test execution
- **CPQ Password**: The CPQ login password (for display/pre-fill only; automation uses GitHub secret)
- **Webtester Password**: The tool access password (`APP_PASSWORD`)

The gear icon (top-right) opens the **Login Defaults** modal (requires admin password `Agco2022!`). Saved defaults are stored in the database and pre-fill the form on every visit.

### Runner Settings (header gear icon)

Accessible after login via the ⚙ icon in the navigation bar. Requires admin password.

| Setting | Options | Default | Notes |
|---|---|---|---|
| Genuine Care Default | Annual / Standard / Parts-Only | Standard | Default GC type in the Scenarios form |
| Annual Duration | 12 / 24 / 36 / 48 / 60 months | 60 | Duration sent to the Annual flow |
| Service Condition Preset | Minimum / Medium / Maximum | Minimum | Controls Start/Last Service and Duration for Standard and Parts-Only |
| Stage End-point | Configuration / Order | Configuration | Only visible when Environment = Stage |

**Service Condition Preset details:**

| Preset | Start Service | Last Service | Duration |
|---|---|---|---|
| Minimum | 2nd lowest option | 2nd lowest option | 12 months |
| Medium | 2nd lowest option | 6th lowest option | 48 months |
| Maximum | Lowest option | Highest option | Highest available |

---

## 7. Scenarios

### Creating a Scenario

1. Enter a description (free text, used as the scenario name in the Runs table)
2. Add up to 5 VINs using the dynamic row input; each row has:
   - VIN text field (auto-uppercased)
   - Genuine Care dropdown (Annual / Standard / Parts-Only), defaulting to the app_settings value
3. Click **Add Scenario**

### Rules
- Maximum 5 VINs per scenario
- Each VIN must have a Genuine Care type
- Scenarios are auto-deleted after 30 days

---

## 8. Test Runs

### Triggering a Run

Click the **Run** button next to a scenario. The app:
1. Reads the session context (env/brand/country) from the login cookie
2. Reads the current runner settings from `app_settings`
3. Creates a `pending` run record in the database
4. Dispatches the GitHub Actions workflow with all parameters
5. Redirects to the Runs page

### Runs Table Columns

| Column | Description |
|---|---|
| Run ID | Short identifier (R-xxxxxx) |
| Scenario | Scenario ID + description |
| Env | Environment badge (Prod/Stage) + Brand · Country |
| VINs / Genuine Care | VINs with color coding + GC type per VIN |
| Config ID | Hyperlink to the saved CPQ configuration |
| Order ID | Order ID (Stage + Order endpoint), `config test only` (Prod), or `—` |
| Status | pending (animated) / completed / failed |
| Started | Timestamp |
| Duration | Live timer (mm:ss) while pending; elapsed time when complete |
| Actions | Details link + Download PDFs button |

### VIN Color Coding

| Color | Meaning |
|---|---|
| Green | All steps completed successfully |
| Yellow | Completed, but one or more specifications required manual selection |
| Red | One or more steps failed (see Details for logs) |

### PDF Downloads

The ZIP file contains different PDFs depending on the run type:

| Scenario | PDFs in ZIP |
|---|---|
| Prod (any) or Stage + Configuration endpoint | Parts Picklist, Service Checklist |
| Stage + Order endpoint | Parts Picklist, Service Checklist, Genuine Care Order Details, Maintenance Agreement |

---

## 9. Playwright NA Test Flow (Step by Step)

The script `tests/cpq-na-test.mjs` executes the following per VIN:

1. **Navigate to CPQ URL** — opens the resolved URL (from URL matrix) in a new tab
2. **Login (first VIN only)** — enters CPQ credentials on the login form
3. **Accept cookie consent** — dismisses the banner if present
4. **Tab Machine: Enter VIN** — fills the VIN input and submits
5. **Tab Configuration → Overview: Select Genuine Care** — clicks the Genuine Care card/tile
6. **Tab Configuration → Choose GC Options** — selects Annual / Standard / Parts-Only per scenario
7. **Tab Configuration → Specifications:**
   - Always selects "Power version with standard hydraulic oil" if present
   - Any additional spec prompts: always picks the first available option
   - **Annual:** sets Duration dropdown to `ANNUAL_DURATION` (from settings)
   - **Standard / Parts-Only:** applies service condition preset logic:
     - Gets all Start Service, Last Service, and Duration dropdown options
     - Applies Minimum/Medium/Maximum preset to pick the correct values
     - Machine Start Hour: enters `0`, reads the red validation message for the valid range ("between X and Y"), enters X+1
8. **Click Apply Changes** → waits for spinner → **Click Add to Configuration** → waits for Summary page
9. **Tab Configuration → Summary: Save** — clicks Save, confirms popup if present, waits for CONFIG URL
10. **Download Parts Picklist PDF** — triggers browser download, saves as `parts-picklist-{VIN}.pdf`
11. **Download Service Checklist PDF** — saves as `service-checklist-{VIN}.pdf`
12. **→ PROD: Journey ends here** (or Stage + Configuration endpoint) — records `"config test only"` as Order ID
13. **Click Create Quote** (Stage + Order endpoint only)
14. **Tab Quotation:**
    - Clicks OK on customer ownership confirmation popup
    - Searches last name "Test", selects a random customer from results
    - Saves quotation
    - Clicks "Order" in the header
15. **Tab Order (Stage only):**
    - Selects a random dealer account ID from dropdown
    - Clicks "Place Order"
    - Captures the Order ID from the page or URL
    - Downloads "Genuine Care Order Details" PDF → `gc-order-details-{VIN}.pdf`
    - Downloads "Maintenance Agreement" PDF → `maintenance-agreement-{VIN}.pdf`
16. **→ STAGE: Journey ends here**
17. Repeats steps 4–16 for the next VIN (same browser session, new tab)

**After all VINs:**
Zips all downloaded PDFs, uploads to Vercel Blob, POSTs results + PDF URL + order IDs to the webhook.

---

## 10. Environment Variables & Secrets Reference

### Vercel Environment Variables (set in Vercel project settings)

| Variable | Description |
|---|---|
| `APP_PASSWORD` | Webtester access password |
| `SETTINGS_PASSWORD` | Admin settings password (default: `Agco2022!`) |
| `AUTH_SECRET` | HMAC key for session cookie signing (random 32-char string) |
| `WEBHOOK_SECRET` | Shared secret for GitHub Actions → webhook authentication |
| `GITHUB_TOKEN` | GitHub Personal Access Token (repo + workflow scopes) |
| `GITHUB_REPO` | GitHub repo in `owner/repo` format (e.g. `Robert-Engstler/cpq-na-webtester`) |
| `POSTGRES_URL` | Neon PostgreSQL connection string (auto-set by Vercel Postgres) |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob token (auto-set when Blob is added to project) |

### GitHub Actions Secrets (set in repo Settings → Secrets)

| Secret | Description |
|---|---|
| `WEBHOOK_URL` | Full URL to the app's webhook endpoint: `https://<domain>/api/runs/webhook` |
| `WEBHOOK_SECRET` | Same value as the Vercel `WEBHOOK_SECRET` variable |
| `BLOB_READ_WRITE_TOKEN` | Same value as the Vercel `BLOB_READ_WRITE_TOKEN` variable |
| `CPQ_PASSWORDS` | JSON map: `{"Prod\|FT\|US": "...", "Prod\|FT\|CA": "...", ...}` for all 8 combinations |

---

## 11. Deployment

### First-time Setup

1. **Create Vercel project** — connect GitHub repo `cpq-na-webtester`; choose Next.js framework
2. **Add Vercel Postgres** — creates a Neon PostgreSQL database; connection string auto-added as env var
3. **Add Vercel Blob** — creates blob storage; token auto-added as env var
4. **Set remaining env vars** in Vercel dashboard (APP_PASSWORD, SETTINGS_PASSWORD, AUTH_SECRET, WEBHOOK_SECRET, GITHUB_TOKEN, GITHUB_REPO)
5. **Run DB schema** — in Vercel Postgres query console, execute the full contents of `db/schema.sql`
6. **Set GitHub Actions secrets** — add WEBHOOK_URL, WEBHOOK_SECRET, BLOB_READ_WRITE_TOKEN, CPQ_PASSWORDS to the repo
7. **Deploy** — push to `main`; Vercel auto-deploys

### Verifying the Deployment

- [ ] Login page shows Environment/Brand/Country dropdowns, CPQ credentials fields, gear icon
- [ ] Login defaults gear (admin password `Agco2022!`) saves and pre-fills on next visit
- [ ] Scenarios page shows per-VIN GC selector; default matches runner settings
- [ ] Creating a scenario persists correctly (check Vercel Postgres)
- [ ] Triggering a run dispatches the GitHub Actions workflow (verify in Actions tab)
- [ ] Playwright script logs in to the correct CPQ URL
- [ ] Run completes and results appear in the Runs page
- [ ] PDF download link works and ZIP contains the correct files

---

## 12. Related Files

| File | Purpose |
|---|---|
| `db/schema.sql` | Full database schema definition |
| `src/lib/cpq-urls.ts` | URL matrix + resolver function |
| `src/lib/session.ts` | Session context cookie parser |
| `tests/cpq-na-test.mjs` | Playwright NA test script |
| `.github/workflows/test.yml` | GitHub Actions workflow definition |
| `concept/Concept_Webtester_NA.docx` | Original requirements document |
| `concept/Webtester_NA.xlsx` | URL matrix source data |
