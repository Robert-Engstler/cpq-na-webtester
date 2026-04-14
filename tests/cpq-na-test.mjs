/**
 * CPQ NA End-to-End Test Script
 *
 * Runs the full Genuine Care CPQ flow for one or more VINs.
 * Supports Annual, Standard, and Parts-Only service types.
 * For Prod environment: stops after saving configuration.
 * For Stage environment: optionally continues to create a quote and place an order.
 *
 * Required env vars:
 *   VINS              - Comma-separated VINs
 *   GC_OPTIONS        - Comma-separated GC types, parallel to VINS (Annual|Standard|Parts-Only)
 *   RUN_ID            - UUID of the test_run DB record
 *   CPQ_URL           - Resolved CPQ URL (e.g. https://cpq.agcocorp.com/fendt/dealer/en_US/aftersales/machineselection)
 *   CPQ_USERNAME      - CPQ login username
 *   CPQ_PASSWORDS     - JSON map of "Env|Brand|Country" -> password (from GitHub secret)
 *   ENVIRONMENT       - Prod | Stage
 *   BRAND             - FT | MF
 *   COUNTRY           - US | CA
 *   STAGE_ENDPOINT    - Configuration | Order (Stage only, default: Configuration)
 *   GC_DEFAULT        - Default GC type (fallback if not in GC_OPTIONS)
 *   ANNUAL_DURATION   - Duration months for Annual (default: 60)
 *   SVC_PRESET        - Minimum | Medium | Maximum (default: Minimum)
 *   SVC_OPTIONS       - Comma-separated per-VIN overrides, parallel to VINS (duration for Annual, preset for Standard/Parts-Only)
 *   WEBHOOK_URL       - Full URL to POST results to
 *   WEBHOOK_SECRET    - Bearer token for webhook auth
 *   BLOB_READ_WRITE_TOKEN - Vercel Blob token
 */

import { chromium } from "playwright";
import { readFileSync, existsSync } from "fs";
import { execSync } from "child_process";

// ── Environment ───────────────────────────────────────────────────────────────

// Load .env.local for local runs
try {
  const envFile = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of envFile.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=["']?(.+?)["']?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch { /* .env.local not present in CI */ }

const vinList = (process.env.VINS ?? "").split(",").map(v => v.trim()).filter(Boolean);
const gcList  = (process.env.GC_OPTIONS  ?? "").split(",").map(g => g.trim()).filter(Boolean);
const svcList = (process.env.SVC_OPTIONS ?? "").split(",").map(s => s.trim());
const RUN_ID          = process.env.RUN_ID;
const CPQ_URL         = process.env.CPQ_URL ?? "";
const CPQ_USERNAME    = process.env.CPQ_USERNAME ?? "";
const ENVIRONMENT     = process.env.ENVIRONMENT ?? "Prod";
const BRAND           = process.env.BRAND ?? "FT";
const COUNTRY         = process.env.COUNTRY ?? "US";
const STAGE_ENDPOINT  = process.env.STAGE_ENDPOINT ?? "Configuration";
const ANNUAL_DURATION = process.env.ANNUAL_DURATION ?? "60";
const SVC_PRESET      = process.env.SVC_PRESET ?? "Minimum";
const WEBHOOK_URL     = process.env.WEBHOOK_URL;
const WEBHOOK_SECRET  = process.env.WEBHOOK_SECRET;

// Resolve CPQ password from the JSON map (never passed as plain input to avoid log exposure)
let CPQ_PASSWORD = "";
try {
  const passwords = JSON.parse(process.env.CPQ_PASSWORDS ?? "{}");
  CPQ_PASSWORD = passwords[`${ENVIRONMENT}|${BRAND}|${COUNTRY}`] ?? "";
} catch { /* ignore parse error */ }

if (vinList.length === 0 || !CPQ_URL || !CPQ_USERNAME || !CPQ_PASSWORD) {
  console.error("Missing required env vars (VINS, CPQ_URL, CPQ_USERNAME, CPQ_PASSWORDS)");
  process.exit(1);
}
if (!WEBHOOK_URL || !WEBHOOK_SECRET || !RUN_ID) {
  console.warn("⚠ Webhook vars missing — running in local mode (results will not be posted)");
}

console.log(`Environment: ${ENVIRONMENT} | Brand: ${BRAND} | Country: ${COUNTRY}`);
console.log(`VINs: ${vinList.join(", ")}`);
console.log(`GC options: ${gcList.join(", ")}`);
console.log(`Stage endpoint: ${STAGE_ENDPOINT}  |  SVC preset: ${SVC_PRESET}  |  Annual duration: ${ANNUAL_DURATION}`);

// ── Step tracking ─────────────────────────────────────────────────────────────

const results = [];
const orderIdsMap = {}; // VIN -> order ID or "config test only"

async function pass(step, extra = {}) {
  const { page, startTime, ...rest } = extra;
  const url = page ? page.url() : undefined;
  const durationMs = startTime != null ? Date.now() - startTime : undefined;
  const result = { step, passed: true, ...rest };
  if (url !== undefined) result.url = url;
  if (durationMs !== undefined) result.durationMs = durationMs;
  results.push(result);
  console.log(`✓ ${step}${durationMs != null ? ` (${durationMs}ms)` : ""}`);
  await postStep(result);
}

async function fail(step, err, extra = {}) {
  const { page, startTime } = extra;
  const url = page ? page.url() : undefined;
  const durationMs = startTime != null ? Date.now() - startTime : undefined;
  const screenshotUrl = page ? await screenshotToBlob(page, step) : null;
  const result = { step, passed: false, error: String(err) };
  if (url !== undefined) result.url = url;
  if (durationMs !== undefined) result.durationMs = durationMs;
  if (screenshotUrl) result.screenshotUrl = screenshotUrl;
  results.push(result);
  console.error(`✗ ${step}: ${err}`);
  await postStep(result);
}

// ── Webhook ───────────────────────────────────────────────────────────────────

async function postStep(stepResult) {
  if (!WEBHOOK_URL || !RUN_ID) return;
  try {
    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${WEBHOOK_SECRET}` },
      body: JSON.stringify({ type: "step", run_id: RUN_ID, step: stepResult }),
    });
  } catch { /* don't fail the test over a telemetry issue */ }
}

async function postResults(status, pdfZipUrl) {
  if (!WEBHOOK_URL) return;
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${WEBHOOK_SECRET}` },
      body: JSON.stringify({
        run_id: RUN_ID,
        status,
        result_json: results,
        pdf_url: pdfZipUrl ?? undefined,
        order_ids: orderIdsMap,
      }),
    });
    if (!res.ok) console.error(`Webhook responded with ${res.status}`);
    else console.log(`Results posted — status: ${status}`);
  } catch (err) {
    console.error("Failed to post results:", err);
  }
}

// ── Blob upload ───────────────────────────────────────────────────────────────

async function uploadToBlob(filePath, filename) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return null;
  const body = readFileSync(filePath);
  const res = await fetch(`https://blob.vercel-storage.com/${filename}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-api-version": "7",
      "Content-Type": "application/zip",
      "x-allow-public-access": "0",
    },
    body,
  });
  if (!res.ok) { const errBody = await res.text().catch(() => ""); console.error(`Blob upload failed: ${res.status} — ${errBody}`); return null; }
  const { url } = await res.json();
  console.log(`  Uploaded: ${url}`);
  return url;
}

async function screenshotToBlob(page, label) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token || !RUN_ID) return null;
  try {
    const buf = await page.screenshot({ fullPage: false });
    const safeName = label.replace(/[^a-z0-9]/gi, "-").toLowerCase().slice(0, 60);
    const filename = `${RUN_ID}/screenshots/${safeName}-${Date.now()}.png`;
    const res = await fetch(`https://blob.vercel-storage.com/${filename}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-api-version": "7",
        "x-content-type": "image/png",
      },
      body: buf,
    });
    if (!res.ok) return null;
    const { url } = await res.json();
    console.log(`  Screenshot: ${url}`);
    return url;
  } catch { return null; }
}

// ── Helpers ───────────────────────────────────────────────────────────────────


async function dismissConsentBanner(page) {
  try {
    await page.evaluate(() => {
      document.getElementById("consent_blackbar")?.remove();
    });
  } catch { /* ignore — page may be navigating */ }
}

/** Fill credentials on any login form and wait until we have left ALL login pages. */
async function fillAndSubmitLogin(page) {
  const usernameField = page.locator("input[type='text'], input[type='email']").first();
  const visible = await usernameField.isVisible({ timeout: 8000 }).catch(() => false);
  if (!visible) return;

  await usernameField.fill(CPQ_USERNAME);
  await page.waitForTimeout(500);

  const pwField = page.locator("input[type='password']").first();
  const pwVisible = await pwField.isVisible({ timeout: 5000 }).catch(() => false);
  if (!pwVisible) return;
  await pwField.fill(CPQ_PASSWORD);
  await page.waitForTimeout(500);

  const loginBtn = page.getByRole("button", { name: /log.?in|sign.?in|anmelden|submit|weiter|next|continue/i }).first();
  const btnVisible = await loginBtn.isVisible({ timeout: 3000 }).catch(() => false);
  if (!btnVisible) {
    await page.locator("button[type='submit'], button").first().click();
  } else {
    await loginBtn.click();
  }

  // Wait until the browser has left ALL login pages (SSO and CPQ-native /login path)
  await page.waitForFunction(
    () => !window.location.href.includes("aaat.agcocorp.com") &&
          !window.location.href.includes("/login") &&
          !window.location.href.includes("/oauth") &&
          !window.location.href.includes("/callback"),
    null, { timeout: 90000, polling: 500 }
  );
  await page.waitForLoadState("load", { timeout: 30000 });
}

/**
 * Wait up to `timeoutMs` for a login form to appear, then fill it.
 * Works for both AGCO SSO (aaat.agcocorp.com) and CPQ-native (/aftersales/login).
 * The CPQ /login page is a JS relay — no visible form itself; it redirects to SSO.
 * So we watch for the FORM to appear (not the URL) before filling credentials.
 */
async function loginIfNeeded(page, timeoutMs = 15000) {
  const field = page.locator("input[type='text'], input[type='email']").first();
  const visible = await field.isVisible({ timeout: timeoutMs }).catch(() => false);
  if (!visible) return;
  await fillAndSubmitLogin(page);
}

/** Resolve which Start/Last/Duration values to use based on SVC_PRESET and available options */
function resolvePreset(preset, startOpts, lastOpts, durationOpts) {
  switch (preset) {
    case "Medium":
      return {
        start:    startOpts[1]  ?? startOpts[0],
        last:     lastOpts[5]   ?? lastOpts[lastOpts.length - 1],
        duration: "48",
      };
    case "Maximum":
      return {
        start:    startOpts[0],
        last:     lastOpts[lastOpts.length - 1],
        duration: durationOpts[durationOpts.length - 1] ?? "60",
      };
    case "Minimum":
    default:
      return {
        start:    startOpts[1]  ?? startOpts[0],
        last:     lastOpts[1]   ?? lastOpts[0],
        duration: "12",
      };
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  const headless = process.env.HEADLESS !== "false";
  const channel  = !headless && process.platform === "win32" ? "msedge" : undefined;
  const browser  = await chromium.launch({ headless, channel });
  const context  = await browser.newContext({ acceptDownloads: true });
  await context.route(/trustarc|truste\.com|consent\.js/i, route => route.abort());

  const page = await context.newPage();
  let overallStatus = "complete";
  const allPdfPaths = [];
  let t0;

  try {
    // ── 1. Login (once for all VINs) ──────────────────────────────────────────
    t0 = Date.now();
    try {
      await page.goto(CPQ_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
      // Handle login — works for both CPQ-native (/aftersales/login) and AGCO SSO
      await loginIfNeeded(page);
      await pass("Login", { page, startTime: t0 });
    } catch (err) {
      await fail("Login", err, { page, startTime: t0 });
      overallStatus = "failed";
      throw err;
    }

    // ── 2. Accept cookies (once) ───────────────────────────────────────────────
    t0 = Date.now();
    try {
      const btn = page.getByRole("button", { name: /required cookies|accept/i });
      if (await btn.first().isVisible({ timeout: 5000 })) {
        await btn.first().click();
      }
      await pass("Accept cookies", { page, startTime: t0 });
    } catch {
      await pass("Accept cookies", { page, startTime: t0 });
    }

    // ── VIN loop ──────────────────────────────────────────────────────────────
    // Reuse the same authenticated page — CPQ uses tab-scoped sessions
    for (let vinIdx = 0; vinIdx < vinList.length; vinIdx++) {
      const VIN = vinList[vinIdx];
      const gcOption = gcList[vinIdx] ?? process.env.GC_DEFAULT ?? "Standard";
      const svcOverride = svcList[vinIdx] ?? "";
      const vinAnnualDuration = (gcOption === "Annual" && svcOverride) ? svcOverride : ANNUAL_DURATION;
      const vinSvcPreset = (gcOption !== "Annual" && svcOverride) ? svcOverride : SVC_PRESET;
      const prefix = `[${VIN}]`;
      console.log(`\n── Processing ${VIN} (${gcOption}) ──`);

      const vinPage = page; // reuse authenticated tab
      let vinFailed = false;

      try {
        // ── 3. Tab Machine: Enter VIN ────────────────────────────────────────
        t0 = Date.now();
        try {
          let vinInput = null;

          if (vinIdx === 0) {
            // First VIN: full page navigation — Angular OAuth token not yet established,
            // CPQ will redirect: machineselection → /login relay → AGCO SSO.
            // We handle login in a retry loop.
            await vinPage.goto(CPQ_URL, { waitUntil: "domcontentloaded", timeout: 120000 });

            let loginsDone = 0;
            const deadline = Date.now() + 120000;

            while (!vinInput && Date.now() < deadline) {
              const url = vinPage.url();
              const onSso = url.includes("aaat.agcocorp.com");
              const onCpqLogin = url.includes("/login");

              if (onSso || onCpqLogin) {
                const loginField = vinPage.locator("input[type='text'], input[type='email']").first();
                const appeared = await loginField.waitFor({ state: "visible", timeout: 30000 }).then(() => true).catch(() => false);
                if (appeared) {
                  if (loginsDone >= 3) throw new Error("Too many login redirects — possible credential issue");
                  await fillAndSubmitLogin(vinPage);
                  loginsDone++;
                } else {
                  await vinPage.waitForTimeout(2000);
                }
                continue;
              }

              const cpqVin = vinPage.locator(
                "input#searchText, input[placeholder*='VIN'], input[placeholder*='Serial'], input[aria-label*='VIN']"
              ).first();
              if (await cpqVin.waitFor({ state: "visible", timeout: 10000 }).then(() => true).catch(() => false)) {
                if (vinPage.url().includes("aaat.agcocorp.com") || vinPage.url().includes("/login")) continue;
                vinInput = cpqVin; break;
              }
              if (vinPage.url().includes("aaat.agcocorp.com") || vinPage.url().includes("/login")) continue;
              await vinPage.waitForTimeout(2000);
            }
          } else {
            // VINs 2+: navigate back to machine selection via goto().
            // The Angular OAuth token from VIN 1 is still valid — no SSO redirect expected.
            await vinPage.goto(CPQ_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
            await loginIfNeeded(vinPage);
            vinInput = vinPage.locator("input#searchText").first();
            await vinInput.waitFor({ state: "visible", timeout: 30000 });
          }

          if (!vinInput) throw new Error("Timed out waiting for VIN input");

          await dismissConsentBanner(vinPage);
          await vinInput.fill(VIN);
          await vinInput.press("Enter");

          // Wait for Angular to navigate away from machineselection to the accessories/overview page
          await vinPage.waitForFunction(
            () => !window.location.href.includes("/machineselection"),
            null, { timeout: 30000, polling: 300 }
          );
          const urlAfter = vinPage.url();
          if (urlAfter.includes("aaat.agcocorp.com") || urlAfter.includes("/login")) {
            throw new Error("VIN search redirected to login (token expired after Enter)");
          }
          await pass(`${prefix} VIN search (Tab Machine)`, { page: vinPage, startTime: t0 });
        } catch (err) {
          await fail(`${prefix} VIN search (Tab Machine)`, err, { page: vinPage, startTime: t0 });
          overallStatus = "failed";
          throw err;
        }

        // ── 4. Tab Configuration → Overview: Select Genuine Care ──────────────
        t0 = Date.now();
        try {
          await dismissConsentBanner(vinPage);
          // Navigate to Configuration tab if not already there
          const configTab = vinPage.getByRole("tab", { name: /configuration/i });
          if (await configTab.count() > 0) await configTab.click();

          // Click the GenuineCare card / tile.
          // EN: "GenuineCare"  |  FR (CA): "Un véritable soin"
          const gcCard = vinPage.getByText("GenuineCare")
            .or(vinPage.getByText("Un véritable soin"))
            .first();
          await gcCard.waitFor({ state: "visible", timeout: 45000 });
          await gcCard.click();
          await vinPage.waitForLoadState("load", { timeout: 15000 });
          await pass(`${prefix} Select Genuine Care (Tab Configuration → Overview)`, { page: vinPage, startTime: t0 });
        } catch (err) {
          await fail(`${prefix} Select Genuine Care (Tab Configuration → Overview)`, err, { page: vinPage, startTime: t0 });
          overallStatus = "failed";
          throw err;
        }

        // ── 5. Tab Configuration → Choose GC Options: Select type ─────────────
        t0 = Date.now();
        try {
          await dismissConsentBanner(vinPage);

          // Find the radio/button for the GC option (Annual / Standard / Parts-Only).
          // CPQ takes up to ~30s to render options after clicking GenuineCare.
          // "Parts-Only" may appear as "Parts Only" (space) in the UI — normalise to regex.
          // FR (CA): "Annual" → "Annuel", "Parts-Only" → "Pièces seulement"
          const gcOptionFr = gcOption === "Annual" ? "annuel"
            : gcOption === "Parts-Only" ? "pi\u00e8ces.?seulement|pi\u00e8ces"
            : gcOption;
          const gcOptionRegex = new RegExp(
            gcOption.replace(/[-\s]+/g, ".?") + "|" + gcOptionFr,
            "i"
          );
          const gcButton = vinPage.getByRole("radio", { name: gcOptionRegex })
            .or(vinPage.getByRole("button", { name: gcOptionRegex }))
            .or(vinPage.locator("label").filter({ hasText: gcOptionRegex }))
            .first();
          await gcButton.waitFor({ timeout: 45000 });
          await gcButton.click();
          await vinPage.waitForTimeout(1000);
          await pass(`${prefix} Select ${gcOption} (Tab Configuration → Choose GC Options)`, { page: vinPage, startTime: t0 });
        } catch (err) {
          await fail(`${prefix} Select ${gcOption} (Tab Configuration → Choose GC Options)`, err, { page: vinPage, startTime: t0 });
          overallStatus = "failed";
          throw err;
        }

        // ── 6. Tab Configuration → Specifications ─────────────────────────────
        t0 = Date.now();
        try {
          await dismissConsentBanner(vinPage);

          // Helper: wait for spinner
          const waitForSpinner = () => vinPage.waitForFunction(() => {
            const spinner = document.querySelector("span.page-unload-anim, [class*='spinner'], [class*='loading']");
            return !spinner || (spinner instanceof HTMLElement && spinner.offsetParent === null);
          }, { timeout: 30000 }).catch(() => {});

          // Select "Power version with standard hydraulic oil"
          try {
            const powerVersion = vinPage.getByText(/power version with standard hydraulic oil/i).first();
            await powerVersion.waitFor({ timeout: 10000 });
            await powerVersion.click();
            await vinPage.waitForTimeout(600);
            await waitForSpinner();
            console.log(`  Selected: Power version with standard hydraulic oil`);
          } catch {
            console.log(`  "Power version with standard hydraulic oil" not found — continuing`);
          }

          // Handle additional specifications: always pick first option
          const manualSpecs = [];
          for (let attempt = 0; attempt < 10; attempt++) {
            const specHeaders = vinPage.locator("div.variable-panel div.header, [class*='spec-header'], [class*='choose-option']")
              .filter({ hasText: /choose an option|select|required|choisir une option|s\u00e9lectionner|requis|obligatoire/i });
            const specCount = await specHeaders.count();
            if (specCount === 0) break;

            const header = specHeaders.first();
            if (!(await header.isVisible())) { await vinPage.waitForTimeout(300); continue; }

            const headerText = ((await header.textContent()) ?? "")
              .replace(/choose an option|select|required|choisir une option|s\u00e9lectionner|requis|obligatoire/gi, "").trim();
            if (headerText) manualSpecs.push(headerText);

            await header.scrollIntoViewIfNeeded();
            await header.click();
            await vinPage.waitForTimeout(600);

            const specOptions = vinPage.locator(".option-container .option-name, [class*='option-item']").first();
            if (await specOptions.count() > 0) {
              await specOptions.click();
              await vinPage.waitForTimeout(400);
              await waitForSpinner();
            }
          }

          if (gcOption === "Annual") {
            // ── Annual: set Duration (from ANNUAL_DURATION setting) ───────────
            // Class confirmed from DOM: select-dropdown-duration
            const durationSelect = vinPage.locator("select.select-dropdown-duration").first();
            if (await durationSelect.count() > 0) {
              await durationSelect.selectOption(String(vinAnnualDuration));
              await vinPage.waitForTimeout(500);
              await waitForSpinner();
              console.log(`  Annual Duration: ${vinAnnualDuration} months`);
            } else {
              console.log(`  Annual Duration select not found`);
            }
          } else {
            // ── Standard / Parts-Only: apply SVC_PRESET ───────────────────────
            const allSelects = vinPage.locator("select.select-dropdown-duration, select[class*='duration'], select[class*='service']");
            await vinPage.waitForFunction(() => {
              const sels = document.querySelectorAll("select.select-dropdown-duration, select[class*='duration']");
              return sels.length >= 2;
            }, { timeout: 15000 }).catch(() => {});

            const selCount = await allSelects.count();

            if (selCount >= 2) {
              const startOpts = await allSelects.nth(0).evaluate(sel =>
                [...sel.options].filter(o => o.value.trim()).map(o => o.value)
              );
              const lastOpts = await allSelects.nth(1).evaluate(sel =>
                [...sel.options].filter(o => o.value.trim()).map(o => o.value)
              );
              const durOpts = selCount >= 3
                ? await allSelects.nth(2).evaluate(sel =>
                    [...sel.options].filter(o => o.value.trim()).map(o => o.value))
                : ["12", "24", "36", "48", "60"];

              const preset = resolvePreset(vinSvcPreset, startOpts, lastOpts, durOpts);

              if (preset.start && startOpts.length > 0) {
                await allSelects.nth(0).selectOption(preset.start);
                await vinPage.waitForTimeout(500);
                await waitForSpinner();
                console.log(`  Start Service: ${preset.start} (${vinSvcPreset})`);
              }
              if (preset.last && lastOpts.length > 0) {
                await allSelects.nth(1).selectOption(preset.last);
                await vinPage.waitForTimeout(500);
                await waitForSpinner();
                console.log(`  Last Service: ${preset.last} (${vinSvcPreset})`);
              }
              try {
                const freshSelects = vinPage.locator("select.select-dropdown-duration, select[class*='duration'], select[class*='service']");
                const freshCount = await freshSelects.count();
                if (freshCount >= 3) {
                  await freshSelects.nth(2).selectOption(preset.duration, { timeout: 10000 });
                  await vinPage.waitForTimeout(500);
                  await waitForSpinner();
                  console.log(`  Duration: ${preset.duration} (${vinSvcPreset})`);
                }
              } catch {
                console.log(`  Duration select not available — skipping`);
              }
            }
          }

          // ── Machine Start Hour (all GC types) ────────────────────────────────
          // The field has no name/id — found via nearby label span.
          // EN: "Machine Start Hour"  |  FR (CA): label contains both "machine" and "heure"
          const startHourInput = vinPage.locator(
            "xpath=//span[contains(translate(text(),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'machine start')]" +
            "/ancestor::div[.//input][1]//input[@type='number' or @type='text']"
          ).or(vinPage.locator(
            "xpath=//span[contains(translate(text(),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'machine') and contains(translate(text(),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'heure')]" +
            "/ancestor::div[.//input][1]//input[@type='number' or @type='text']"
          )).or(
            vinPage.locator("input[name*='machineStart'], input[id*='machineStart'], input[name*='startHour'], input[id*='startHour']")
          ).first();

          if (await startHourInput.count() > 0) {
            await startHourInput.scrollIntoViewIfNeeded();
            await startHourInput.click({ clickCount: 3 });
            // Enter "1" not "0": if the field is pre-filled with 0 (Annual), filling "0" again
            // produces no change event and Angular never fires the validation message.
            await startHourInput.fill("1");
            await startHourInput.dispatchEvent("input");
            await startHourInput.press("Tab");
            await vinPage.waitForTimeout(1000);

            // Grab all error labels — no text filter, works for EN + FR
            const allErrorTexts = await vinPage.locator(".form-error-label, .text-danger")
              .allTextContents()
              .catch(() => []);
            // Only treat as a range message if it contains "range" or "between" — avoids
            // misidentifying unrelated messages like "Select at least 2 service intervals for 15% discount"
            const errorMsg = allErrorTexts.find(t => /(?:range|between|entre|intervalle)\s*\d/i.test(t)) ?? "";
            if (errorMsg) console.log(`  Machine Start Hour error msg: "${errorMsg.trim()}"`);

            // Generic: extract first two numbers from the error message (min then max)
            // Works for EN "range 50 to 500", FR "entre 50 et 500", etc.
            const numbersInMsg = errorMsg.replace(/,/g, "").match(/\d+/g);
            if (numbersInMsg && numbersInMsg.length >= 2) {
              const minVal = parseInt(numbersInMsg[0], 10);
              const validValue = String(minVal + 1);
              await startHourInput.click({ clickCount: 3 });
              await startHourInput.fill(validValue);
              await startHourInput.dispatchEvent("input");
              await startHourInput.press("Tab");
              console.log(`  Machine Start Hour: ${validValue} (range: ${numbersInMsg[0]} to ${numbersInMsg[1]})`);
            } else {
              // Range message not found — revert field to "0" (original pre-filled value for Annual).
              // Leaving "1" can block Apply Changes if the field has no minimum and 0 is the right default.
              await startHourInput.click({ clickCount: 3 });
              await startHourInput.fill("0");
              await startHourInput.dispatchEvent("input");
              await startHourInput.press("Tab");
              console.log(`  Machine Start Hour range message not found — reverted to 0`);
            }
            await vinPage.waitForTimeout(500);
            await waitForSpinner();
          }

          if (manualSpecs.length > 0) {
            await pass(`${prefix} Tab Configuration → Specifications`, { page: vinPage, startTime: t0, hadManualSpec: true, manualSpecs });
          } else {
            await pass(`${prefix} Tab Configuration → Specifications`, { page: vinPage, startTime: t0 });
          }
        } catch (err) {
          await fail(`${prefix} Tab Configuration → Specifications`, err, { page: vinPage, startTime: t0 });
          overallStatus = "failed";
        }

        // ── 7. Apply Changes → Add to Configuration ───────────────────────────
        t0 = Date.now();
        try {
          await dismissConsentBanner(vinPage);

          const waitForSpinner = () => vinPage.waitForFunction(() => {
            const spinner = document.querySelector("span.page-unload-anim, [class*='spinner'], [class*='loading']");
            return !spinner || (spinner instanceof HTMLElement && spinner.offsetParent === null);
          }, { timeout: 60000 }).catch(() => {});

          // EN: "Apply Changes"  |  FR: "Appliquer les modifications"
          const applyBtn = vinPage.getByRole("button", { name: /apply changes|appliquer/i });
          await applyBtn.scrollIntoViewIfNeeded();
          await applyBtn.click();
          await waitForSpinner();
          await vinPage.waitForTimeout(1000);
          await dismissConsentBanner(vinPage);

          // EN: "Add to Configuration"  |  FR: "Ajouter à la configuration"
          const addToConfigBtn = vinPage.getByRole("button", { name: /add to configuration|ajouter/i });
          const appeared = await addToConfigBtn.waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
          if (!appeared) {
            await vinPage.screenshot({ path: `debug-apply-${VIN}.png`, fullPage: true }).catch(() => {});
            console.log(`  Screenshot: debug-apply-${VIN}.png | URL: ${vinPage.url()}`);
            const errs = await vinPage.locator(".form-error-label, .text-danger, [class*='error'], [class*='invalid']")
              .allTextContents().catch(() => []);
            if (errs.length) console.log(`  Errors on page: ${errs.map(t => t.trim()).filter(Boolean).join(" | ")}`);
            // Retry Apply Changes once
            console.log(`  Add to Configuration not visible — retrying Apply Changes`);
            await dismissConsentBanner(vinPage);
            const retryApply = vinPage.getByRole("button", { name: /apply changes|appliquer/i });
            if (await retryApply.count() > 0) {
              await retryApply.click();
              await waitForSpinner();
              await vinPage.waitForTimeout(1000);
            }
            await addToConfigBtn.waitFor({ timeout: 60000 });
          }
          await addToConfigBtn.click();
          await waitForSpinner();
          await vinPage.waitForTimeout(2000);
          await dismissConsentBanner(vinPage);

          // Wait for Save button (Summary page) — EN: "Save"  |  FR: "Enregistrer" / "Sauvegarder"
          await vinPage.getByRole("button", { name: /save|enregistrer|sauvegarder/i }).first().waitFor({ timeout: 60000 });
          await pass(`${prefix} Apply changes → Add to configuration`, { page: vinPage, startTime: t0 });
        } catch (err) {
          await fail(`${prefix} Apply changes → Add to configuration`, err, { page: vinPage, startTime: t0 });
          overallStatus = "failed";
          throw err;
        }

        // ── 8. Tab Configuration → Summary: Save ──────────────────────────────
        await dismissConsentBanner(vinPage);
        let configId = null;
        let configUrl = null;
        t0 = Date.now();
        try {
          // EN: "Save" / "Save Configuration"  |  FR: "Sauvegarder" or "Enregistrer" (exact)
          // :text-is() does exact visible-text matching — avoids "Enregistrer sous" and hidden icon buttons.
          const saveBtn = vinPage.locator(
            "button:text-is('Sauvegarder'), button:text-is('Enregistrer'), button:text-is('Save')"
          ).first();
          await saveBtn.click();

          // Confirm save popup if it appears — EN: "Save/Confirm/Yes"  |  FR: "Enregistrer/Confirmer/Oui"
          const confirmBtn = vinPage.locator(".modal-content button.btn-primary.float-end:not([disabled]), .modal button").filter({ hasText: /save|confirm|yes|enregistrer|confirmer|oui/i });
          const confirmAppeared = await confirmBtn.first().waitFor({ timeout: 8000 }).then(() => true).catch(() => false);
          if (confirmAppeared) await confirmBtn.first().click();

          await vinPage.waitForURL(/\/configure\//, { timeout: 20000 });
          // Config URL may use a CONFIG-prefixed number or a UUID — capture either
          const configMatch = vinPage.url().match(/\/configure\/([A-Za-z0-9\-]+)/);
          configId = configMatch?.[1] ?? null;
          configUrl = vinPage.url();
          if (configId) console.log(`  Config ID: ${configId}`);

          await pass(`${prefix} Save Config`, { page: vinPage, startTime: t0, configId, configUrl });
        } catch (err) {
          await fail(`${prefix} Save Config`, err, { page: vinPage, startTime: t0 });
          overallStatus = "failed";
        }

        // ── 9. Download Parts Picklist PDF ─────────────────────────────────────
        await dismissConsentBanner(vinPage);
        // CA French: after clicking "Sauvegarder", a "Sauvegarde configuration" modal appears.
        // Scope the SAUVEGARDER click to inside the dialog to avoid re-clicking the main save
        // button and re-triggering the modal. The Name field is pre-filled; no customer ID required.
        try {
          const dialog = vinPage.getByRole("dialog");
          const dialogVisible = await dialog.waitFor({ state: "visible", timeout: 3000 }).then(() => true).catch(() => false);
          if (dialogVisible) {
            console.log(`  Completing config save modal (CA)`);
            const saveInDialog = dialog.getByRole("button", { name: /^sauvegarder$/i });
            await saveInDialog.click({ timeout: 5000 }).catch(e => console.log(`  Save modal click error: ${e.message}`));
            await vinPage.waitForTimeout(1500);
          }
        } catch (e) {
          console.log(`  CA save modal error: ${e.message}`);
        }
        t0 = Date.now();
        try {
          // EN: "Download" / "Parts Picklist"  |  FR: "Télécharger" / "Nomenclature des pièces"
          // Button may not appear in CA French workflow — skip gracefully if not found.
          const dlBtns = vinPage.locator("button, a[download], a[href*='.pdf']").filter({ hasText: /download|parts.?picklist|t\u00e9l\u00e9charger|nomenclature|picklist/i });
          const dlFound = await dlBtns.first().waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
          if (!dlFound) {
            console.log(`  Parts Picklist PDF button not found — skipping`);
            await pass(`${prefix} Download Parts Picklist PDF`, { page: vinPage, startTime: t0 });
          } else {
            const [dl] = await Promise.all([
              vinPage.waitForEvent("download", { timeout: 45000 }),
              dlBtns.nth(0).click(),
            ]);
            const partsPath = `parts-picklist-${VIN}.pdf`;
            await dl.saveAs(partsPath);
            allPdfPaths.push(partsPath);
            const pdfFilename = dl.suggestedFilename();
            console.log(`  Saved: ${pdfFilename}`);
            // Extract CONFIG... number from filename (e.g. GenuineCare_CONFIG02134811_VIN.pdf)
            const configNumMatch = pdfFilename.match(/CONFIG\d+/i);
            if (configNumMatch) {
              configId = configNumMatch[0].toUpperCase();
              // Replace the UUID segment in configUrl with the CONFIG number so the link works
              if (configUrl) configUrl = configUrl.replace(/\/configure\/[^?#/]+/, `/configure/${configId}`);
            }
            await pass(`${prefix} Download Parts Picklist PDF`, { page: vinPage, startTime: t0, configId, configUrl });
          }
        } catch (err) {
          await fail(`${prefix} Download Parts Picklist PDF`, err, { page: vinPage, startTime: t0 });
          overallStatus = "failed";
        }

        // ── 10. Download Service Checklist PDF ────────────────────────────────
        await dismissConsentBanner(vinPage);
        t0 = Date.now();
        try {
          // EN: "Download" / "Service Checklist"  |  FR: "Télécharger" / "Liste de contrôle"
          // Button may not appear in CA French workflow — skip gracefully if not found.
          // After step 9, the Parts Picklist "Download" button may be gone — count remaining
          // buttons and pick last one (service checklist is always the second/last download).
          const dlBtns = vinPage.locator("button, a[download], a[href*='.pdf']").filter({ hasText: /download|service.?checklist|t\u00e9l\u00e9charger|liste.?de.?contr|checklist/i });
          const dlFound = await dlBtns.first().waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
          if (!dlFound) {
            console.log(`  Service Checklist PDF button not found — skipping`);
            await pass(`${prefix} Download Service Checklist PDF`, { page: vinPage, startTime: t0 });
          } else {
            const count = await dlBtns.count();
            // If both picklist + checklist buttons still visible: use nth(1); otherwise nth(0).
            const svcDlBtn = dlBtns.nth(count > 1 ? 1 : 0);
            const [dl] = await Promise.all([
              vinPage.waitForEvent("download", { timeout: 45000 }),
              svcDlBtn.click(),
            ]);
            const svcPath = `service-checklist-${VIN}.pdf`;
            await dl.saveAs(svcPath);
            allPdfPaths.push(svcPath);
            const svcFilename = dl.suggestedFilename();
            console.log(`  Saved: ${svcFilename}`);
            // Extract CONFIG... number if not already found in step 9 (Annual/Standard have no parts picklist)
            if (!configId || !/^CONFIG\d+$/i.test(configId)) {
              const configNumMatch = svcFilename.match(/CONFIG\d+/i);
              if (configNumMatch) {
                configId = configNumMatch[0].toUpperCase();
                if (configUrl) configUrl = configUrl.replace(/\/configure\/[^?#/]+/, `/configure/${configId}`);
              }
            }
            await pass(`${prefix} Download Service Checklist PDF`, { page: vinPage, startTime: t0, configId, configUrl });
          }
        } catch (err) {
          await fail(`${prefix} Download Service Checklist PDF`, err, { page: vinPage, startTime: t0 });
          overallStatus = "failed";
        }

        // ── PROD: Journey ends here ─────────────────────────────────────────
        if (ENVIRONMENT === "Prod" || STAGE_ENDPOINT === "Configuration") {
          orderIdsMap[VIN] = "config test only";
          console.log(`  → Journey ends at configuration (${ENVIRONMENT})`);
          continue; // next VIN
        }

        // ── Stage flow continues below ──────────────────────────────────────

        // ── 11. Click Create Quote ─────────────────────────────────────────────
        t0 = Date.now();
        try {
          await dismissConsentBanner(vinPage);
          // EN: "Create Quote"  |  FR: "Créer un devis" / "Créer une citation"
          const createQuoteBtn = vinPage.getByRole("button", { name: /create quote|cr[eé]er un devis|cr[eé]er une citation|cr[eé]er/i });
          await createQuoteBtn.waitFor({ timeout: 15000 });
          await createQuoteBtn.click();

          // CA French: clicking "Créer un devis" may trigger an "unsaved changes" modal
          // ("CONFIGURATION NON SAUVEGARDÉE") — click "SAUVEGARDER" to save and proceed.
          await vinPage.waitForTimeout(1500);
          const unsavedModal = vinPage.getByRole("button", { name: /^sauvegarder$/i })
            .or(vinPage.locator("button").filter({ hasText: /^sauvegarder$/i })).first();
          const modalAppeared = await unsavedModal.waitFor({ state: "visible", timeout: 4000 }).then(() => true).catch(() => false);
          if (modalAppeared) {
            console.log(`  Unsaved config modal — clicking Sauvegarder`);
            await unsavedModal.click();
            await vinPage.waitForTimeout(1500);
          }

          // CPQ SPA: waitForLoadState is meaningless here — wait for the customer
          // ownership OK button or the quotation search field to appear instead.
          await pass(`${prefix} Click Create Quote`, { page: vinPage, startTime: t0 });
        } catch (err) {
          await fail(`${prefix} Click Create Quote`, err, { page: vinPage, startTime: t0 });
          overallStatus = "failed";
          throw err;
        }

        // ── 12. Tab Quotation ──────────────────────────────────────────────────
        t0 = Date.now();
        try {
          await dismissConsentBanner(vinPage);

          // Click OK to confirm customer ownership record (concept doc: always appears)
          // Wait up to 30s — CPQ may do an async ownership lookup before showing the modal
          const okBtn = vinPage.getByRole("button", { name: /^ok$/i })
            .or(vinPage.locator("button").filter({ hasText: /^ok$/i })).first();
          const okAppeared = await okBtn.waitFor({ state: "visible", timeout: 30000 }).then(() => true).catch(() => false);
          if (okAppeared) {
            await okBtn.click();
            console.log(`  Customer ownership OK clicked`);
          } else {
            console.log(`  Customer ownership OK not found — continuing`);
          }
          await vinPage.waitForTimeout(1000);

          // Wait for page-unload-div overlay to clear before interacting with the quotation form
          await vinPage.locator(".page-unload-div.show, .page-unload-div").waitFor({ state: "hidden", timeout: 30000 }).catch(() => {});

          // Search for customer by last name "Test"
          // Field has id="lastName" with no placeholder or name attribute
          // CA Stage may not have "Test" customers — try multiple terms, proceed without if none found
          const searchField = vinPage.locator("input#lastName, input[id*='lastName'], input[placeholder*='last'], input[name*='lastName']").first();
          await searchField.waitFor({ timeout: 15000 });
          const searchTerms = ["T", "Test", "Lang", "Maple", "Agco"];
          let selectFound = false;
          // Use a single locator — .or() with an overlapping selector doubles the count,
          // causing randomIdx to exceed the real number of visible "Select" buttons.
          const selectBtns = vinPage.locator("button").filter({ hasText: /^select$|^s[eé]lectionner$|^choisir$/i });
          // EN: "Search"  |  FR: "Chercher" / "Rechercher"
          const searchBtn = vinPage.getByRole("button", { name: /search|chercher|rechercher|trouver|find/i })
            .or(vinPage.locator("button").filter({ hasText: /search|chercher|rechercher|trouver|find/i }))
            .first();
          for (const term of searchTerms) {
            await searchField.fill(term);
            // Wait for overlay to clear before each search click
            await vinPage.locator(".page-unload-div.show, .page-unload-div").waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});
            const searchEnabled = await searchBtn.isEnabled().catch(() => false);
            if (!searchEnabled) continue;
            await searchBtn.click();
            await vinPage.waitForTimeout(2000);
            selectFound = await selectBtns.first().waitFor({ timeout: 3000 }).then(() => true).catch(() => false);
            if (selectFound) { console.log(`  Customer search matched for term "${term}"`); break; }
          }

          // Select a random customer if results appeared — EN: "Select"  |  FR: "Sélectionner" / "Choisir"
          if (selectFound) {
            const selectCount = await selectBtns.count();
            // Cap at 10 — pick from the first page of results only
            const randomIdx = Math.floor(Math.random() * Math.min(selectCount, 10));
            console.log(`  Selecting customer ${randomIdx + 1} of ${selectCount}`);
            // Wait for page-unload-div overlay to clear before clicking — it blocks the click
            await vinPage.locator(".page-unload-div").waitFor({ state: "hidden", timeout: 15000 }).catch(() => {});
            await selectBtns.nth(randomIdx).scrollIntoViewIfNeeded().catch(() => {});
            await selectBtns.nth(randomIdx).click();
            await vinPage.waitForTimeout(800);
          } else {
            console.log(`  No customers found — proceeding without customer selection`);
          }

          // CA French: quotation has mandatory sub-tabs that must be visited in order before
          // "Sauvegarder le devis" / "Save Quotation" becomes clickable.
          // Sub-tabs: éléments supplémentaires → conditions générales → courrier → récapitulatif
          // "Récapitulatif" appears in BOTH main nav AND sub-tabs — use last() to hit the sub-tab.
          const quotationSubTabs = [
            { pattern: /[eé]l[eé]ments\s+suppl[eé]mentaires/i, nth: "first" },
            { pattern: /conditions\s+g[eé]n[eé]rales/i,         nth: "first" },
            { pattern: /courrier/i,                               nth: "first" },
            { pattern: /r[eé]capitulatif/i,                      nth: "last"  },
          ];
          for (const { pattern, nth } of quotationSubTabs) {
            const allEls = vinPage.getByText(pattern);
            const count = await allEls.count();
            if (count === 0) continue;
            const tabEl = nth === "last" ? allEls.last() : allEls.first();
            await vinPage.locator(".page-unload-div").waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});
            await tabEl.click();
            await vinPage.waitForTimeout(1000);
          }

          // EN: "Save Quotation"  |  FR: "Sauvegarder le devis" / "Enregistrer le devis"
          // Saves the quotation in-place. After saving, the Order tab in the main nav becomes enabled.
          const saveQuotationBtn = vinPage.getByRole("button", { name: /save.?quotation|save quote|sauvegarder le devis|enregistrer le devis/i }).first();
          await saveQuotationBtn.waitFor({ timeout: 10000 });
          await vinPage.locator(".page-unload-div.show, .page-unload-div").waitFor({ state: "hidden", timeout: 15000 }).catch(() => {});
          await vinPage.waitForTimeout(500);
          console.log(`  Clicking Save Quotation`);
          await saveQuotationBtn.click();
          // Wait for save: first wait for the overlay to appear (confirming action fired),
          // then wait for it to clear (save complete). Success toast appears briefly after.
          await vinPage.locator(".page-unload-div").waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
          await vinPage.locator(".page-unload-div").waitFor({ state: "hidden", timeout: 20000 }).catch(() => {});
          await vinPage.waitForTimeout(2000);
          console.log(`  Save Quotation done, URL: ${vinPage.url()}`);

          // Click "Order" tab in the top navigation.
          // Strategy 1: find <a href*="/asorder/"> (Angular renders the routerLink as href)
          // Strategy 2: find by visible text "Order" / "Commande" in nav (not sub-tabs)
          // Strategy 3 (fr_CA fallback): URL is configure/UUID → navigate directly to asorder/UUID
          const currentUrl = vinPage.url();

          // Log all nav link hrefs to help diagnose selector issues
          const navHrefs = await vinPage.evaluate(() =>
            [...document.querySelectorAll("nav a, .navbar a, a[routerlink]")].map(a => a.getAttribute("href")).filter(Boolean)
          ).catch(() => []);
          console.log(`  Nav hrefs: ${navHrefs.join(" | ")}`);

          const orderTabByHref = vinPage.locator('a[href*="/asorder/"]').first();
          const orderTabByText = vinPage.locator("nav a, .navbar a, a.nav-link").filter({ hasText: /^\s*(Order|Commande)\s*$/i }).last();

          if (await orderTabByHref.waitFor({ state: "visible", timeout: 8000 }).then(() => true).catch(() => false)) {
            console.log(`  Clicking Order tab by href`);
            await orderTabByHref.click();
          } else if (await orderTabByText.waitFor({ state: "visible", timeout: 5000 }).then(() => true).catch(() => false)) {
            console.log(`  Clicking Order tab by text`);
            await orderTabByText.click();
          } else {
            // fr_CA: still on configure/UUID URL — navigate directly
            const asorderUrl = currentUrl.replace(/\/configure\/([^?#]+)/, '/asorder/$1');
            if (asorderUrl !== currentUrl) {
              console.log(`  Order tab not found — navigating directly: ${asorderUrl}`);
              await vinPage.goto(asorderUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
            } else {
              // Last resort: JS evaluate to find any <a> with asorder in href or text "Order"
              await vinPage.evaluate(() => {
                const byHref = document.querySelector('a[href*="asorder"]');
                if (byHref) { byHref.click(); return; }
                const all = [...document.querySelectorAll("a")];
                const byText = all.find(a => /^\s*(Order|Commande)\s*$/.test(a.textContent?.trim() ?? ""));
                if (byText) byText.click();
              });
            }
          }
          await vinPage.waitForURL(/\/asorder\//, { timeout: 30000 });
          console.log(`  On Order screen: ${vinPage.url()}`);

          await pass(`${prefix} Tab Quotation (search customer, save, → Order)`, { page: vinPage, startTime: t0 });
        } catch (err) {
          await fail(`${prefix} Tab Quotation`, err, { page: vinPage, startTime: t0 });
          overallStatus = "failed";
          throw err;
        }

        // ── 13. Tab Order: Place Order ─────────────────────────────────────────
        let orderId = null;
        t0 = Date.now();
        try {
          await dismissConsentBanner(vinPage);
          // Wait for Angular to render the Order tab content
          await vinPage.waitForTimeout(3000);

          // The Order screen requires clicking "Save Quotation" before Place Order becomes available.
          // EN: "Save Quotation"  |  FR: "Sauvegarder le devis" / "Enregistrer"
          const saveOnOrderBtn = vinPage.getByRole("button", { name: /save.?quotation|save quote|sauvegarder le devis|enregistrer le devis/i });
          const saveOnOrderFound = await saveOnOrderBtn.first().waitFor({ state: "visible", timeout: 20000 }).then(() => true).catch(() => false);
          if (saveOnOrderFound) {
            console.log(`  Saving quotation on Order screen`);
            await vinPage.locator(".page-unload-div.show, .page-unload-div").waitFor({ state: "hidden", timeout: 15000 }).catch(() => {});
            await saveOnOrderBtn.first().click();
            await vinPage.waitForTimeout(3000);
          } else {
            console.log(`  No Save Quotation button on Order screen — proceeding directly`);
          }

          // Select dealer account ID if a select exists on this page
          const allOrderSelects = vinPage.locator("select");
          const orderSelectCount = await allOrderSelects.count();
          if (orderSelectCount > 0) {
            for (let si = 0; si < orderSelectCount; si++) {
              const opts = await allOrderSelects.nth(si).evaluate(sel =>
                [...sel.options].filter(o => o.value.trim()).map(o => o.value)
              );
              if (opts.length > 1) {
                const pick = opts[Math.floor(Math.random() * opts.length)];
                await allOrderSelects.nth(si).selectOption(pick);
                await vinPage.waitForTimeout(500);
                console.log(`  Selected from select[${si}]: ${pick}`);
                break;
              }
            }
          }

          // EN: "Place Order"  |  FR: "Placer la commande" / "Passer la commande"
          const placeOrderBtn = vinPage.getByRole("button", { name: /place order|placer la commande|passer la commande/i });
          const placeOrderFound = await placeOrderBtn.waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
          if (!placeOrderFound) throw new Error("Place Order button not found after 20s");
          await placeOrderBtn.click();

          // After clicking Place Order, CPQ may queue the order.
          // Success indicator: URL changes from /asorder/UUID to /asorder/NUMERIC (e.g. /asorder/9901357151).
          // Re-click Place Order up to 3 times if the URL hasn't changed after 30s.
          let postOrderText = "";
          for (let attempt = 1; attempt <= 3; attempt++) {
            // Wait for URL to change to numeric order ID — this is the definitive success signal
            const urlChanged = await vinPage.waitForURL(/\/asorder\/\d{4,}/, { timeout: 30000 })
              .then(() => true).catch(() => false);
            if (urlChanged) {
              console.log(`  Order placed — URL: ${vinPage.url()}`);
              break;
            }
            // URL still has UUID — order is queued or processing. Re-click Place Order.
            if (attempt < 3) {
              console.log(`  Order not confirmed after 30s (attempt ${attempt}/3) — re-clicking Place Order`);
              const btnVisible = await placeOrderBtn.waitFor({ state: "visible", timeout: 5000 }).then(() => true).catch(() => false);
              if (btnVisible) await placeOrderBtn.click();
            } else {
              console.log(`  Order not confirmed after 3 attempts`);
            }
          }
          postOrderText = await vinPage.locator("body").textContent({ timeout: 5000 }).catch(() => "");

          // Extract order ID — priority order:
          // 1. URL: /asorder/9901357151 (numeric segment = order ID)
          // 2. FR page: "ID de référence CPQ 9901357151"
          // 3. EN toast: "with the reference of 9901357151"
          // 4. Any 99XXXXXXX number
          const urlOrderMatch = vinPage.url().match(/\/asorder\/(\d{4,})/);
          const orderNumMatch = urlOrderMatch
            ?? postOrderText.match(/r[eé]f[eé]rence\D{0,15}(\d{4,})/i)
            ?? postOrderText.match(/reference\s+of\s+(\d{4,})/i)
            ?? postOrderText.match(/N°\s*de\s*commande\D{0,10}(\d{4,})/i)
            ?? postOrderText.match(/\b(99\d{5,})\b/)
            ?? postOrderText.match(/order\s*(?:number|id|#|no\.?)[:\s#]*([A-Z0-9\-]{4,})/i);
          if (orderNumMatch) {
            orderId = orderNumMatch[1];
            console.log(`  Order ID captured: ${orderId}`);
          } else {
            console.log(`  Order ID not found in page text or URL`);
          }

          if (orderId) {
            orderIdsMap[VIN] = orderId;
          } else {
            console.log(`  Order placed but Order ID not captured`);
            orderIdsMap[VIN] = "placed";
          }

          await pass(`${prefix} Place Order`, { page: vinPage, startTime: t0, orderId });
        } catch (err) {
          await fail(`${prefix} Tab Order`, err, { page: vinPage, startTime: t0 });
          overallStatus = "failed";
        }

        // ── 14. Download Genuine Care Order Details PDF ────────────────────────
        // Wait for Place Order button to disappear — confirms order is fully processed.
        await vinPage.getByRole("button", { name: /place order|placer la commande|passer la commande/i })
          .waitFor({ state: "hidden", timeout: 60000 }).catch(() => {});
        // Wait for page-unload-div overlay to clear after order processing
        await vinPage.locator(".page-unload-div").waitFor({ state: "hidden", timeout: 30000 }).catch(() => {});
        await dismissConsentBanner(vinPage);
        // Log page text for debugging PDF button selectors
        const postOrderPageText = await vinPage.locator("body").textContent({ timeout: 5000 }).catch(() => "");
        console.log(`  Post-order page text (500 chars): ${postOrderPageText.slice(0, 500)}`);
        t0 = Date.now();
        try {
          // Post-order page shows two "Téléchargement" / "Download" buttons:
          //   nth(0) = Genuine Care Order Details  ("Genuine Care Détails de la commande")
          //   nth(1) = Maintenance Agreement        ("Accord de maintenance")
          const allDlBtns = vinPage.getByRole("button", { name: /t[eé]l[eé]chargement|download/i });
          const dlFound = await allDlBtns.first().waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
          if (!dlFound) {
            console.log(`  GC Order Details PDF button not found — skipping`);
            await pass(`${prefix} Download Genuine Care Order Details PDF`, { page: vinPage, startTime: t0 });
          } else {
            await vinPage.locator(".page-unload-div").waitFor({ state: "hidden", timeout: 15000 }).catch(() => {});
            const [dl] = await Promise.all([
              vinPage.waitForEvent("download", { timeout: 45000 }),
              allDlBtns.nth(0).click(),
            ]);
            const gcOrderPath = `gc-order-details-${VIN}.pdf`;
            await dl.saveAs(gcOrderPath);
            allPdfPaths.push(gcOrderPath);
            const gcFilename = dl.suggestedFilename();
            console.log(`  Saved: ${gcFilename}`);
            // Extract order ID from PDF filename if not yet captured
            if (!orderId) {
              const idMatch = gcFilename.match(/\b(99\d{5,})\b/) ?? gcFilename.match(/(\d{7,})/);
              if (idMatch) { orderId = idMatch[1]; orderIdsMap[VIN] = orderId; console.log(`  Order ID from PDF filename: ${orderId}`); }
            }
            await pass(`${prefix} Download Genuine Care Order Details PDF`, { page: vinPage, startTime: t0 });
          }
        } catch (err) {
          await fail(`${prefix} Download Genuine Care Order Details PDF`, err, { page: vinPage, startTime: t0 });
          overallStatus = "failed";
        }

        // ── 15. Download Maintenance Agreement PDF ────────────────────────────
        // Second "Téléchargement" / "Download" button on the post-order page
        await dismissConsentBanner(vinPage);
        t0 = Date.now();
        try {
          const allDlBtns = vinPage.getByRole("button", { name: /t[eé]l[eé]chargement|download/i });
          const count = await allDlBtns.count();
          if (count < 2) {
            console.log(`  Maintenance Agreement PDF button not found (only ${count} download buttons) — skipping`);
            await pass(`${prefix} Download Maintenance Agreement PDF`, { page: vinPage, startTime: t0 });
          } else {
            await vinPage.locator(".page-unload-div").waitFor({ state: "hidden", timeout: 15000 }).catch(() => {});
            const [dl] = await Promise.all([
              vinPage.waitForEvent("download", { timeout: 45000 }),
              allDlBtns.nth(1).click(),
            ]);
            const maintPath = `maintenance-agreement-${VIN}.pdf`;
            await dl.saveAs(maintPath);
            allPdfPaths.push(maintPath);
            console.log(`  Saved: ${dl.suggestedFilename()}`);
            await pass(`${prefix} Download Maintenance Agreement PDF`, { page: vinPage, startTime: t0 });
          }
        } catch (err) {
          await fail(`${prefix} Download Maintenance Agreement PDF`, err, { page: vinPage, startTime: t0 });
          overallStatus = "failed";
        }

      } catch {
        if (!vinFailed) overallStatus = "failed";
        console.log(`  Skipping remaining steps for ${VIN}`);
      }
    } // end VIN loop

  } catch {
    overallStatus = "failed";
  } finally {
    await browser.close();

    // ── Zip all PDFs ──────────────────────────────────────────────────────────
    let pdfZipUrl = null;
    const existing = allPdfPaths.filter(p => existsSync(p));
    if (existing.length > 0) {
      try {
        const zipPath = "pdfs.zip";
        if (process.platform === "win32") {
          execSync(`tar -acf ${zipPath} ${existing.join(" ")}`);
        } else {
          execSync(`zip -j ${zipPath} ${existing.join(" ")}`);
        }
        console.log(`\nZipped ${existing.length} PDFs into pdfs.zip`);
        pdfZipUrl = await uploadToBlob(zipPath, `${RUN_ID}/pdfs.zip`);
      } catch (err) {
        console.error("Failed to zip/upload PDFs:", err);
      }
    }

    if (WEBHOOK_URL) {
      await postResults(overallStatus, pdfZipUrl);
    } else {
      console.log(`\n── Results (${overallStatus}) ──`);
      for (const r of results) {
        console.log(`  ${r.passed ? "✓" : "✗"} ${r.step}${r.error ? ": " + r.error : ""}${r.durationMs != null ? ` (${r.durationMs}ms)` : ""}`);
      }
      console.log("Order IDs:", orderIdsMap);
    }
  }
}

run().catch(err => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
