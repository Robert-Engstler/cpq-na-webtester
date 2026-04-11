# Website Test Runner — Project Plan

## Project Overview

A web app hosted on Vercel that lets users run automated end-to-end UI tests against a website, parameterised by up to **5 VINs** and **Language**. Tests are executed via Playwright running in GitHub Actions, with results reported back to the app in real time.

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend & Backend | Next.js (TypeScript) | UI and API routes, hosted on Vercel |
| Database | Vercel Postgres | Stores scenarios, test runs, results |
| File Storage | Vercel Blob | Stores failure screenshots and downloaded PDFs |
| Test Execution | GitHub Actions | Runs Playwright in a Linux environment |
| Browser Automation | Playwright | End-to-end UI testing |
| Source Control | Private GitHub Repo | Code, workflow definitions, secrets |

---

## Features

### Core
- Define test scenarios with up to **5 VINs** and **Language** as inputs
- Trigger test runs on demand from the UI
- Playwright script executes full UI test flow including login
- Conditional radio button logic — leaves preselected options as-is, otherwise picks a random option
- Step-by-step pass/fail reporting per test run
- All credentials stored securely in GitHub Secrets and Vercel Environment Variables — never in code

### Screenshots
- Automatic screenshot capture on step failure
- Screenshots stored in Vercel Blob, displayed inline in results UI

### PDF Handling
- Playwright downloads PartsPicklist + ServiceChecklist PDFs per VIN
- All PDFs zipped into one file per run, uploaded to Vercel Blob
- Run detail page shows "Download PDFs (.zip)" link
- *(Future)* Text extracted from PDFs using `pdf-parse` and saved alongside the test run

### Results & Reporting
- Real-time run status indicator (pending → running → complete)
- Full run history per scenario
- Re-run button per scenario
- Side-by-side comparison view between two runs of the same VIN + language
- Filter and sort run history by status, date, VIN, language

### Performance Metrics *(later phase)*
- Core Web Vitals per run: LCP, FCP, CLS
- Custom interaction timings (e.g. time from VIN search to results appearing)
- Performance trend charts across historical runs
- Configurable pass/fail thresholds per metric

### Automatic VIN Fetching from Redshift *(later phase)*
- Replace manual VIN entry with a dropdown populated from the data warehouse
- Three implementation options depending on IT infrastructure approval:
  - **Option A** — Redshift Data API called directly from Vercel
  - **Option B** — Local Python bridge executable running inside the company network
  - **Option C** — Scheduled VIN export to an external location Vercel can reach
- SQL query configurable in app settings
- Manual VIN override always available as fallback

### Parallel Test Execution *(later phase)*
- "Run All" button to trigger all scenarios simultaneously
- Each scenario runs as an independent GitHub Actions job
- Up to 20 concurrent jobs on GitHub free plan
- Note: requires separate test credentials per parallel run if site enforces single active session

---

## Architecture

```
Browser (user)
  └── Vercel App (Next.js)
        ├── Scenario UI — enter VINs (up to 5) + language, save, list scenarios
        ├── API route — triggers GitHub Actions workflow via GitHub API
        ├── Webhook receiver — receives results from GitHub Actions
        └── Results UI — run history, step breakdown, screenshots, PDF text
              │
        GitHub Actions
              ├── Receives comma-separated VINs + language as workflow inputs
              ├── Runs Playwright against the website (fresh tab per VIN)
              ├── Captures screenshots on failure → uploads to Vercel Blob
              ├── Downloads PDFs per VIN → zips all into one file → uploads to Vercel Blob
              └── POSTs structured results + pdf_url back to Vercel webhook endpoint
```

---

## Database Schema

### `scenarios`
| Column | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| name | TEXT | User-defined scenario name |
| vins | TEXT[] | Vehicle Identification Numbers (1–5) |
| language | TEXT | Selected language |
| created_at | TIMESTAMP | Creation date |

### `test_runs`
| Column | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| scenario_id | UUID | Foreign key to scenarios |
| status | TEXT | pending / running / complete / failed |
| result_json | JSONB | Step-by-step pass/fail results |
| screenshot_url | TEXT | Vercel Blob URL of failure screenshot |
| pdf_url | TEXT | Vercel Blob URL of downloaded PDF |
| pdf_text | TEXT | Extracted text from PDF |
| performance_json | JSONB | Core Web Vitals and custom timings |
| created_at | TIMESTAMP | Run start time |

---

## Completed Work

### Phase 1 — Core Loop (MVP) ✅
*Fully delivered. All tasks complete.*

- Auth system (single-password HMAC-SHA256 cookie)
- DB schema + migration endpoint
- Scenarios CRUD API (`GET`, `POST`, `DELETE /api/scenarios`)
- Runs API (`GET /api/runs`, `GET /api/runs/[id]`, `POST /api/runs/trigger`, `POST /api/runs/webhook`)
- GitHub Actions workflow (`workflow_dispatch` with `vins`, `language`, `run_id` inputs)
- Playwright script: multi-VIN E2E test (login once, fresh tab per VIN, PDF zip + Blob upload, webhook POST)
- Secrets configured end-to-end (GitHub Actions ↔ Vercel)
- Production deployment on Vercel with Git integration

### UI Design — Dark Monospace Theme ✅
*Applied across all pages.*

- Shared design tokens (`src/lib/design.ts`): dark bg `#0d0d0d`, JetBrains Mono, color palette
- Login page: dark themed
- Nav bar: dark themed with accent-colored active links
- Scenarios page: "CPQ MRO Runner" heading + instructions, Add Scenario form (description + VINs textareas), paginated table (5/page, sorted newest first), Run/Delete buttons, Scenario ID column
- Runs page: VIN color legend (green/yellow/red), paginated table (5/page, sorted newest first), Run ID + Scenario ID columns, status badges, Details link (opens new tab), Download PDFs button
- Run Details page: VIN legend, compact header (Run ID, Scenario ID, VINs, Status, Started, PDF download), step table with Step ID + color-coded results + descriptions, Raw JSON toggle

### VIN Color Coding ✅
*Green/yellow/red VIN states based on step results.*

- **Green**: all steps passed, all specs pre-populated by sales codes
- **Yellow**: all steps passed, but one or more specifications required manual selection (not pre-populated)
- **Red**: one or more steps failed
- **Gray**: pending/running, or no step data
- Playwright script tracks manual spec selections in Phase B (`hadManualSpec: true`, `manualSpecs` array in step result)
- Frontend `vinColor()` parses VIN from step prefix `[VIN_LABEL]` and checks `hadManualSpec`
- Step descriptions and result icons colored to match (green/yellow/red)

### Mock Page ✅
*Static design reference at `/mock` with hardcoded data demonstrating all UI states.*

---

## Next Up — New Requirements

### 1. Auto-delete after 30 days ✅
- Scenarios and runs automatically deleted from the database 30 days after `created_at`
- Implemented: cleanup SQL runs on every `GET /api/scenarios` and `GET /api/runs`

### 2. Remove Delete button from Scenarios page ✅
- Delete button removed from Scenarios table UI

### 3. UI: No-scroll layout for Scenarios and Runs pages ✅
- Pages use viewport-height layout so everything fits without scrolling (5 records per page)

### 4. UI: Clean up Run Details page for new-tab context ✅
- Nav bar removed since Run Details opens in a new tab; page starts directly with heading

### 5. UI: Full VINs in Run Details step descriptions ✅
- Full VINs shown in step descriptions instead of abbreviated first6…last4

### 6. UI: Add CONFIG ID column to Runs table ✅
- Config ID column added after VINs column, displayed per VIN, blank for failures

### 7. Capture Configuration ID in Playwright ✅
- Step renamed "Save quote" → "Save Config"
- Configuration ID (`CONFIGxxxxxxxx`) captured after save, stored in step result JSON
- Config IDs displayed as clickable links to the CPQ configuration URL

### 8. No-scroll layout + sticky header on Run Details ✅
- All three pages (Scenarios, Runs, Run Details) use viewport-height flex layout
- Run Details steps table scrolls independently with sticky `thead`
- Reduced padding/margins for compact fit

### 9. Animated RUNNING status badge ✅
- Pending status badge shows continuous left-to-right fill sweep animation
- Grey badge color with translucent gradient overlay

### 10. Run duration column (mm:ss) ✅
- Added `finished_at` column to `test_runs` table, set by webhook on completion
- Duration column on Runs page and Duration field in Run Details header
- Live ticking counter while run is active, freezes at final value on completion
- `created_at` reset after GitHub dispatch succeeds so timer starts accurately

### 11. Auto-refresh polling ✅
- Runs page and Run Details page poll API every 5 seconds while any run is pending
- Polling stops automatically once all runs are complete/failed
- Status, results, VIN colors, config IDs, PDFs all update without manual refresh

### 12. Simplified status model ✅
- Removed unused `running` DB status (was never set); only `pending`, `complete`, `failed`
- Pending displayed as "RUNNING", complete displayed as "COMPLETED"

### 13. Run button navigates to Runs page ✅
- Clicking Run on Scenarios page triggers the workflow then navigates to /runs in same tab

### 14. Delete Runs API ✅
- `DELETE /api/runs/[id]` — delete single run
- `DELETE /api/runs` — delete all runs (optional `?scenario_id=` filter)

---

## Session: 6 April 2026 — Playwright Test Script (`tests/cpq-na-test.mjs`)

### What was done this session

The CPQ NA Playwright E2E test script was debugged and brought to a fully passing state for the Stage / FT / US environment with a Standard GC type.

**Test steps now passing end-to-end:**
1. ✅ Login (AGCO SSO at `aaat.agcocorp.com`, "Benutzername"/"Passwort"/"Anmelden")
2. ✅ Accept cookies
3. ✅ VIN search (Tab Machine) — enters VIN into `input#searchText`, waits for URL to leave `/machineselection`
4. ✅ Select GenuineCare — clicks the `"GenuineCare"` tile (no space — was broken with `/genuine care/i`)
5. ✅ Select GC type (Standard / Annual / Parts-Only)
6. ✅ Tab Configuration → Specifications — sets Start Service, Last Service; reads Machine Start Hour range from red validation message and fills `minVal + 1`
7. ✅ Apply changes → Add to configuration
8. ✅ Save Config — captures Config ID (UUID or CONFIG-prefix format)
9. ✅ Download Parts Picklist PDF
10. ✅ Download Service Checklist PDF

**Key fixes made:**
- **Efficiency**: VINs 2+ use Machine tab click (Angular client-side routing) instead of `goto()` — avoids ~30s SSO re-login per VIN
- **Post-Enter wait**: `waitForFunction` watching URL leave `/machineselection` (replaced unreliable `waitForLoadState`)
- **GenuineCare selector**: `"GenuineCare"` (exact, no space)
- **Duration select**: wrapped in try-catch — gracefully skipped if not available after Start/Last Service changes the DOM
- **Machine Start Hour**: enters `0` + `Tab` (blur) to trigger Angular validation, reads `.form-error-label` for `"in the range X to Y"` message, fills `minVal + 1`. Regex: `/(?:between\s+|range\s+)([\d,]+)\s+(?:and|to)\s+([\d,]+)/i`
- **Save button**: broadened from `/^save$/i` to `/save/i` to match "Save As" / "Save Configuration" variants
- **Config ID regex**: captures UUID-format and CONFIG-prefix IDs from URL
- **Removed**: debug pause, all debug `console.log` calls, `vinPage.close()` (was closing shared page)

### Where to continue next session

The Standard GC full flow (Configuration endpoint) is complete and tested. Remaining work:

1. **Test Annual GC type** — uses a Duration dropdown (months) instead of Start/Last Service hour selects; run with `GC_OPTIONS=Annual` in `.env.local`
2. **Test Parts-Only GC type** — similar to Standard
3. **Test Stage + Order endpoint** — set `STAGE_ENDPOINT=Order` in `.env.local`; this continues through steps 11–15 (Create Quote → Tab Quotation → Tab Order → Place Order → Download GC Order Details PDF + Maintenance Agreement PDF)
4. **Test multi-VIN run** — set `VINS=VIN1,VIN2` to verify VINs 2+ use Machine tab correctly (no SSO re-login)
5. **Test Prod environment** — journey ends at Save Config (no Quote/Order)
6. **Test MF brand** — different CPQ URL and credentials

---

## Session: 7–8 April 2026 — Order Endpoint Testing

### What was done this session

**Configuration endpoint:** All 3 GC types (Annual, Standard, Parts-Only) confirmed passing end-to-end for Stage | FT | US (steps 1–10).

**Order endpoint (Stage):** Investigated and partially fixed the Quotation → Order flow.

**Key issue found and fixed — "Order" tab navigation:**
- Previous selector `locator("a, button, [role='tab'], li a, nav a, .nav-item a").filter({ hasText: /^order$/i })` never found the element
- Diagnostic logging revealed CPQ header nav uses `<span>` elements (not `<a>` or `<button>`) — neither matched the old selector
- Nav structure confirmed: `Machine | Configuration | Summary | Quotation | Order` rendered as plain text spans inside a header nav component
- **Fix**: Changed to `getByText("Order", { exact: true })` — broadest Playwright selector, matches any visible element with text "Order"
- Result: **Tab Quotation step now passes** (steps 11–12 complete: Create Quote → OK → customer search "Test" → Select customer → Save Quotation → click "Order" header tab)

**All 3 GC types now pass for Order endpoint** ✅ — completed 8 April 2026.

| GC Type | Configuration | Order |
|---|---|---|
| Standard | ✅ | ✅ |
| Annual (12 months) | ✅ | ✅ |
| Parts-Only | ✅ | ✅ |

**Key findings from Order endpoint:**
- "Order" header nav tab: CPQ uses `<span>` elements — selector scoped to nav container with `getByText("Order", { exact: true })`
- Order page URL pattern: `/aftersales/asorder/<UUID>` — Order ID captured from URL
- Dealer account: dropdown select with class `select-field dealer-account-height ...`, options are account IDs
- No PDF downloads after Place Order in Stage (steps 14–15 skip gracefully)
- Annual 60 months fails at Apply Changes (CPQ limitation) — use 12 months (`ANNUAL_DURATION=12`)

### MF brand — confirmed passing ✅ (8 April 2026)

- Stage | MF | US | Standard | Configuration: ✅
- Stage | MF | US | Standard | Order: ✅
- MF CPQ URL: `/masseyferguson/dealer/en_US/aftersales/machineselection`
- MF credentials: `lang.tester@langtest.com` / `Base-Blue-1357` (same as FT — both brands share the SSO)
- MF renders in English with `lang.tester`; French only appears with MAPLE.TESTER (account locale setting)
- VIN used: `AGCMY45GANB179050` (MF 8730 S Dyna-VT)

### Where to continue next session

1. **Multi-VIN** — set `VINS=VIN1,VIN2` in `.env.local`; verify VINs 2+ use Machine tab (no SSO re-login)
2. **Prod environment** — set `ENVIRONMENT=Prod` in `.env.local`; journey ends at Save Config (no Quote/Order)
3. **MF Annual + Parts-Only** — only Standard tested for MF so far

---

## Session: 9–11 April 2026 — CA French Testing

### What was done this session

Tested the CA French (MAPLE.TESTER / fr_CA) flow end-to-end for all 3 GC types at the Configuration endpoint, and partially for the Order endpoint.

**Key differences in CA French workflow vs US English:**

1. **Config save modal** — After clicking "Sauvegarder" (Save Config), a "Sauvegarde configuration" modal appears. Must click "SAUVEGARDER" scoped to `getByRole("dialog")` to complete the save. Clicking "Annuler" leaves the config in an unsaved state, which blocks "Créer une citation".

2. **Parts Picklist PDF** — After properly saving via the modal, a `GenuineCare_CONFIGxxxxxxxx_VIN.pdf` file is downloadable at the Configuration stage. The Service Checklist PDF is not present at Configuration stage (skipped gracefully).

3. **Quotation page differences**:
   - Search button: "Chercher" (not "Rechercher")
   - Save Quotation button: "Sauvegarder le devis"
   - Create Quote button: "CRÉER UNE CITATION"
   - Machine Start Hour range keyword: "intervalle" (French), added to detection regex

4. **Order endpoint — known limitation** — CA Stage has no pre-existing test customers. The Quotation page requires a customer before the quotation can be committed and the Order tab accessed. Script handles gracefully: tries "Test", "Lang", "Maple", "Agco" — all return no results. Proceeds without customer → Tab Quotation PASSES, Tab Order FAILS with "Place Order not found".

### Results

| Brand | Country | Language | GC Type | Configuration | Order |
|---|---|---|---|---|---|
| MF | CA | FR | Standard | ✅ | ⚠️ no test customers |
| MF | CA | FR | Annual (12 months) | ✅ | not tested |
| MF | CA | FR | Parts-Only | ✅ | not tested |

### All EN/US results to date

| Brand | GC Type | Configuration | Order |
|---|---|---|---|
| FT | Standard | ✅ | ✅ |
| FT | Annual (12 months) | ✅ | ✅ |
| FT | Parts-Only | ✅ | ✅ |
| MF | Standard | ✅ | ✅ |
| MF | Annual (12 months) | ✅ | ✅ |
| MF | Parts-Only | ✅ | ✅ |

### Where to continue next session

1. **Multi-VIN** — set `VINS=VIN1,VIN2`; verify VINs 2+ use `goto(CPQ_URL)` + `loginIfNeeded()` correctly
2. **Prod environment** — set `ENVIRONMENT=Prod`; journey ends at Save Config (no Quote/Order)
3. **CA FR Order** — blocked by missing test customers in CA Stage; resolve by adding test customer data

---

## Parked — Future Phases

### Phase 2 — Failure Screenshots (Parked)
- Upload failure screenshots to Vercel Blob from GitHub Actions
- Display screenshots inline below failed steps in results UI
- *Status: Blob storage + screenshot capture on failure already implemented. Remaining: upload + display.*

### Phase 3 — PDF Text Extraction (Parked)
- Extract text from downloaded PDFs using `pdf-parse`
- Include extracted text in webhook payload
- Show collapsible PDF text section in run details UI
- *Status: PDF download + zip + Blob upload done. Remaining: text extraction + display.*

### Phase 4 — Results UI Polish (Parked)
- ~~Run status polling (auto-refresh while pending/running)~~ ✅ Done
- Live log streaming from Playwright steps (push-based via webhook)
- Re-run button per run
- Run history per scenario
- Comparison view (side-by-side diff between two runs)
- Filter and sort controls
- "Run All" button for parallel execution

### Phase 5 — Performance Metrics (Parked)
- Core Web Vitals collection (LCP, FCP, CLS)
- Custom interaction timings
- Performance trend charts
- Pass/fail thresholds

### Phase 6 — Automatic VIN Fetching from Redshift (Parked)
- Replace manual VIN entry with dropdown from data warehouse
- Options: Redshift Data API / local Python bridge / scheduled export
- SQL query configurable in app settings

---

*Last updated: 11 April 2026*
