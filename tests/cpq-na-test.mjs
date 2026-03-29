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
const gcList = (process.env.GC_OPTIONS ?? "").split(",").map(g => g.trim()).filter(Boolean);
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

function pass(step, extra) {
  results.push({ step, passed: true, ...extra });
  console.log(`✓ ${step}`);
}

function fail(step, err) {
  results.push({ step, passed: false, error: String(err) });
  console.error(`✗ ${step}: ${err}`);
}

// ── Webhook ───────────────────────────────────────────────────────────────────

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
      "x-content-type": "application/zip",
    },
    body,
  });
  if (!res.ok) { console.error(`Blob upload failed: ${res.status}`); return null; }
  const { url } = await res.json();
  console.log(`  Uploaded: ${url}`);
  return url;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function dismissConsentBanner(page) {
  await page.evaluate(() => {
    document.getElementById("consent_blackbar")?.remove();
  });
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

  try {
    // ── 1. Login (once for all VINs) ──────────────────────────────────────────
    try {
      await page.goto(CPQ_URL, { waitUntil: "networkidle", timeout: 30000 });

      // CPQ NA login form may use "Email" or "User Name" label
      const usernameField = page.locator("input[type='text'], input[type='email']").first();
      if (await usernameField.isVisible({ timeout: 8000 })) {
        await usernameField.fill(CPQ_USERNAME);
        await page.waitForTimeout(800);
        await page.locator("input[type='password']").first().fill(CPQ_PASSWORD);
        await page.waitForTimeout(800);
        await page.getByRole("button", { name: /log.?in|sign.?in/i }).first().click();
        await page.waitForLoadState("networkidle", { timeout: 30000 });
      }
      pass("Login");
    } catch (err) {
      await page.screenshot({ path: "login-failure.png" });
      fail("Login", err);
      overallStatus = "failed";
      throw err;
    }

    // ── 2. Accept cookies (once) ───────────────────────────────────────────────
    try {
      const btn = page.getByRole("button", { name: /required cookies|accept/i });
      if (await btn.first().isVisible({ timeout: 5000 })) {
        await btn.first().click();
      }
      pass("Accept cookies");
    } catch {
      pass("Accept cookies");
    }

    await page.close();

    // ── VIN loop ──────────────────────────────────────────────────────────────
    for (let vinIdx = 0; vinIdx < vinList.length; vinIdx++) {
      const VIN = vinList[vinIdx];
      const gcOption = gcList[vinIdx] ?? process.env.GC_DEFAULT ?? "Standard";
      const prefix = `[${VIN}]`;
      console.log(`\n── Processing ${VIN} (${gcOption}) ──`);

      const vinPage = await context.newPage();
      let vinFailed = false;

      try {
        // ── 3. Tab Machine: Enter VIN ────────────────────────────────────────
        try {
          await vinPage.goto(CPQ_URL, { waitUntil: "load", timeout: 30000 });
          await dismissConsentBanner(vinPage);

          // VIN input field
          const vinInput = vinPage.locator("input[placeholder*='VIN'], input[placeholder*='Serial'], input[aria-label*='VIN']").first();
          await vinInput.waitFor({ timeout: 15000 });
          await vinInput.fill(VIN);

          // Submit VIN (search button or Enter)
          const searchBtn = vinPage.locator("button[type='submit'], button").filter({ hasText: /search|find|go/i }).first();
          if (await searchBtn.count() > 0) {
            await searchBtn.click();
          } else {
            await vinInput.press("Enter");
          }
          await vinPage.waitForLoadState("networkidle", { timeout: 20000 });
          pass(`${prefix} VIN search (Tab Machine)`);
        } catch (err) {
          await vinPage.screenshot({ path: `vin-search-failure-${VIN}.png` });
          fail(`${prefix} VIN search (Tab Machine)`, err);
          overallStatus = "failed";
          throw err;
        }

        // ── 4. Tab Configuration → Overview: Select Genuine Care ──────────────
        try {
          await dismissConsentBanner(vinPage);
          // Navigate to Configuration tab if not already there
          const configTab = vinPage.getByRole("tab", { name: /configuration/i });
          if (await configTab.count() > 0) await configTab.click();

          // Click the "Genuine Care" card / tile
          const gcCard = vinPage.getByText(/genuine care/i).first();
          await gcCard.waitFor({ timeout: 15000 });
          await gcCard.click();
          await vinPage.waitForLoadState("networkidle", { timeout: 15000 });
          pass(`${prefix} Select Genuine Care (Tab Configuration → Overview)`);
        } catch (err) {
          await vinPage.screenshot({ path: `gc-overview-failure-${VIN}.png` });
          fail(`${prefix} Select Genuine Care (Tab Configuration → Overview)`, err);
          overallStatus = "failed";
          throw err;
        }

        // ── 5. Tab Configuration → Choose GC Options: Select type ─────────────
        try {
          await dismissConsentBanner(vinPage);
          // Find the radio/button for the GC option (Annual / Standard / Parts-Only)
          const gcButton = vinPage.getByRole("radio", { name: new RegExp(gcOption, "i") })
            .or(vinPage.getByRole("button", { name: new RegExp(gcOption, "i") }))
            .or(vinPage.locator("label").filter({ hasText: new RegExp(gcOption, "i") }))
            .first();
          await gcButton.waitFor({ timeout: 15000 });
          await gcButton.click();
          await vinPage.waitForTimeout(1000);
          pass(`${prefix} Select ${gcOption} (Tab Configuration → Choose GC Options)`);
        } catch (err) {
          await vinPage.screenshot({ path: `gc-options-failure-${VIN}.png` });
          fail(`${prefix} Select ${gcOption} (Tab Configuration → Choose GC Options)`, err);
          overallStatus = "failed";
          throw err;
        }

        // ── 6. Tab Configuration → Specifications ─────────────────────────────
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
              .filter({ hasText: /choose an option|select|required/i });
            const specCount = await specHeaders.count();
            if (specCount === 0) break;

            const header = specHeaders.first();
            if (!(await header.isVisible())) { await vinPage.waitForTimeout(300); continue; }

            const headerText = ((await header.textContent()) ?? "")
              .replace(/choose an option|select|required/gi, "").trim();
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
            // ── Annual: set Duration ──────────────────────────────────────────
            const durationSelect = vinPage.locator("select").filter({ hasText: /duration/i })
              .or(vinPage.locator("select[name*='duration'], select[id*='duration']")).first();
            if (await durationSelect.count() > 0) {
              await durationSelect.selectOption(String(ANNUAL_DURATION));
              await vinPage.waitForTimeout(500);
              await waitForSpinner();
              console.log(`  Annual Duration: ${ANNUAL_DURATION}`);
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
              // Collect available options
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

              const preset = resolvePreset(SVC_PRESET, startOpts, lastOpts, durOpts);

              // Start Service
              if (preset.start && startOpts.length > 0) {
                await allSelects.nth(0).selectOption(preset.start);
                await vinPage.waitForTimeout(500);
                await waitForSpinner();
                console.log(`  Start Service: ${preset.start} (${SVC_PRESET})`);
              }

              // Last Service
              if (preset.last && lastOpts.length > 0) {
                await allSelects.nth(1).selectOption(preset.last);
                await vinPage.waitForTimeout(500);
                await waitForSpinner();
                console.log(`  Last Service: ${preset.last} (${SVC_PRESET})`);
              }

              // Duration
              if (selCount >= 3) {
                await allSelects.nth(2).selectOption(preset.duration);
                await vinPage.waitForTimeout(500);
                await waitForSpinner();
                console.log(`  Duration: ${preset.duration} (${SVC_PRESET})`);
              }
            }

            // ── Machine Start Hour: read validation message for valid range ────
            const startHourInput = vinPage.locator(
              "xpath=//span[contains(text(),'Machine Start Hour') or contains(text(),'machine start hour')]" +
              "/ancestor::div[contains(@class,'input') or contains(@class,'field')][1]//input"
            ).or(vinPage.locator("input[name*='machineStart'], input[id*='machineStart'], input[placeholder*='hour']")).first();

            if (await startHourInput.count() > 0) {
              await startHourInput.scrollIntoViewIfNeeded();
              // Clear and enter 0 to trigger the validation message with the valid range
              await startHourInput.click({ clickCount: 3 });
              await startHourInput.fill("0");
              await vinPage.waitForTimeout(800);

              // Read the red error message below the input to find the valid range
              const errorMsg = await vinPage.locator(
                "[class*='error'], [class*='invalid'], [class*='validation'], .field-error"
              ).first().textContent({ timeout: 3000 }).catch(() => "");

              const rangeMatch = (errorMsg ?? "").match(/between\s+([\d,]+)\s+and\s+([\d,]+)/i);
              if (rangeMatch) {
                const minVal = parseInt(rangeMatch[1].replace(/,/g, ""), 10);
                const validValue = String(minVal + 1);
                await startHourInput.click({ clickCount: 3 });
                await startHourInput.fill(validValue);
                console.log(`  Machine Start Hour: ${validValue} (from range: ${rangeMatch[0]})`);
              } else {
                // Fallback: enter 100 (typical minimum is well below this)
                await startHourInput.click({ clickCount: 3 });
                await startHourInput.fill("100");
                console.log(`  Machine Start Hour: 100 (fallback — no range message found)`);
              }
              await vinPage.waitForTimeout(500);
              await waitForSpinner();
            }
          }

          if (manualSpecs.length > 0) {
            pass(`${prefix} Tab Configuration → Specifications — manual specs: ${manualSpecs.join(", ")}`, { hadManualSpec: true, manualSpecs });
          } else {
            pass(`${prefix} Tab Configuration → Specifications`);
          }
        } catch (err) {
          await vinPage.screenshot({ path: `specs-failure-${VIN}.png` });
          fail(`${prefix} Tab Configuration → Specifications`, err);
          overallStatus = "failed";
        }

        // ── 7. Apply Changes → Add to Configuration ───────────────────────────
        try {
          await dismissConsentBanner(vinPage);

          const waitForSpinner = () => vinPage.waitForFunction(() => {
            const spinner = document.querySelector("span.page-unload-anim, [class*='spinner'], [class*='loading']");
            return !spinner || (spinner instanceof HTMLElement && spinner.offsetParent === null);
          }, { timeout: 60000 }).catch(() => {});

          const applyBtn = vinPage.getByRole("button", { name: /apply changes/i });
          await applyBtn.scrollIntoViewIfNeeded();
          await applyBtn.click();
          await waitForSpinner();
          await vinPage.waitForTimeout(1000);
          await dismissConsentBanner(vinPage);

          // Click "Add to Configuration"
          const addToConfigBtn = vinPage.getByRole("button", { name: /add to configuration/i });
          const appeared = await addToConfigBtn.waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
          if (!appeared) {
            // Retry Apply Changes once
            console.log(`  Add to Configuration not visible — retrying Apply Changes`);
            await dismissConsentBanner(vinPage);
            const retryApply = vinPage.getByRole("button", { name: /apply changes/i });
            if (await retryApply.count() > 0) {
              await retryApply.click();
              await waitForSpinner();
              await vinPage.waitForTimeout(1000);
            }
            await addToConfigBtn.waitFor({ timeout: 30000 });
          }
          await addToConfigBtn.click();
          await waitForSpinner();
          await vinPage.waitForTimeout(1000);

          // Wait for Save button (Summary page)
          await dismissConsentBanner(vinPage);
          await vinPage.getByRole("button", { name: /^save$/i }).first().waitFor({ timeout: 30000 });
          pass(`${prefix} Apply changes → Add to configuration`);
        } catch (err) {
          await vinPage.screenshot({ path: `apply-failure-${VIN}.png` });
          fail(`${prefix} Apply changes → Add to configuration`, err);
          overallStatus = "failed";
          throw err;
        }

        // ── 8. Tab Configuration → Summary: Save ──────────────────────────────
        await dismissConsentBanner(vinPage);
        let configId = null;
        let configUrl = null;
        try {
          await vinPage.locator("button.btn-secondary-cta.btn-with-icon, button").filter({ hasText: /^save$/i }).first().click();

          // Confirm save popup if it appears
          const confirmBtn = vinPage.locator(".modal-content button.btn-primary.float-end:not([disabled]), .modal button").filter({ hasText: /save|confirm|yes/i });
          const confirmAppeared = await confirmBtn.first().waitFor({ timeout: 8000 }).then(() => true).catch(() => false);
          if (confirmAppeared) await confirmBtn.first().click();

          await vinPage.waitForURL(/\/configure\/CONFIG|\/configure\/[A-Z0-9]+/, { timeout: 20000 });
          const configMatch = vinPage.url().match(/(CONFIG[A-Z0-9]+)/i);
          configId = configMatch?.[1] ?? null;
          configUrl = vinPage.url();
          if (configId) console.log(`  Config ID: ${configId}`);

          pass(`${prefix} Save Config`, { configId, configUrl });
        } catch (err) {
          fail(`${prefix} Save Config`, err);
          overallStatus = "failed";
        }

        // ── 9. Download Parts Picklist PDF ─────────────────────────────────────
        await dismissConsentBanner(vinPage);
        try {
          const dlBtns = vinPage.locator("button").filter({ hasText: /download|parts.?picklist/i });
          await dlBtns.first().waitFor({ timeout: 15000 });
          const [dl] = await Promise.all([
            vinPage.waitForEvent("download", { timeout: 45000 }),
            dlBtns.nth(0).click(),
          ]);
          const partsPath = `parts-picklist-${VIN}.pdf`;
          await dl.saveAs(partsPath);
          allPdfPaths.push(partsPath);
          console.log(`  Saved: ${dl.suggestedFilename()}`);
          pass(`${prefix} Download Parts Picklist PDF`);
        } catch (err) {
          await vinPage.screenshot({ path: `download-parts-failure-${VIN}.png` });
          fail(`${prefix} Download Parts Picklist PDF`, err);
          overallStatus = "failed";
        }

        // ── 10. Download Service Checklist PDF ────────────────────────────────
        await dismissConsentBanner(vinPage);
        try {
          const dlBtns = vinPage.locator("button").filter({ hasText: /download|service.?checklist/i });
          const [dl] = await Promise.all([
            vinPage.waitForEvent("download", { timeout: 45000 }),
            dlBtns.nth(1).click(),
          ]);
          const svcPath = `service-checklist-${VIN}.pdf`;
          await dl.saveAs(svcPath);
          allPdfPaths.push(svcPath);
          console.log(`  Saved: ${dl.suggestedFilename()}`);
          pass(`${prefix} Download Service Checklist PDF`);
        } catch (err) {
          await vinPage.screenshot({ path: `download-service-failure-${VIN}.png` });
          fail(`${prefix} Download Service Checklist PDF`, err);
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
        try {
          await dismissConsentBanner(vinPage);
          const createQuoteBtn = vinPage.getByRole("button", { name: /create quote/i });
          await createQuoteBtn.waitFor({ timeout: 15000 });
          await createQuoteBtn.click();
          await vinPage.waitForLoadState("networkidle", { timeout: 20000 });
          pass(`${prefix} Click Create Quote`);
        } catch (err) {
          fail(`${prefix} Click Create Quote`, err);
          overallStatus = "failed";
          throw err;
        }

        // ── 12. Tab Quotation ──────────────────────────────────────────────────
        try {
          await dismissConsentBanner(vinPage);

          // Click OK to confirm customer ownership record
          const okBtn = vinPage.getByRole("button", { name: /^ok$/i })
            .or(vinPage.locator(".modal button").filter({ hasText: /ok|confirm/i })).first();
          if (await okBtn.isVisible({ timeout: 8000 })) await okBtn.click();
          await vinPage.waitForTimeout(1000);

          // Search for customer by last name "Test"
          const searchField = vinPage.locator("input[placeholder*='last name'], input[placeholder*='Last Name'], input[name*='lastName']").first();
          await searchField.waitFor({ timeout: 15000 });
          await searchField.fill("Test");
          await vinPage.getByRole("button", { name: /search/i }).first().click();
          await vinPage.waitForLoadState("networkidle", { timeout: 15000 });

          // Select a random customer from the results
          const customerRows = vinPage.locator("table tbody tr, [class*='customer-row'], [class*='result-row']");
          await customerRows.first().waitFor({ timeout: 15000 });
          const customerCount = await customerRows.count();
          const randomCustomer = Math.floor(Math.random() * customerCount);
          await customerRows.nth(randomCustomer).click();
          await vinPage.waitForTimeout(800);

          // Save Quotation
          const saveQuotationBtn = vinPage.getByRole("button", { name: /save.?quotation|save quote/i }).first();
          await saveQuotationBtn.waitFor({ timeout: 10000 });
          await saveQuotationBtn.click();
          await vinPage.waitForTimeout(1000);

          // Click "Order" in header
          const orderLink = vinPage.getByRole("link", { name: /^order$/i })
            .or(vinPage.getByRole("tab", { name: /^order$/i }))
            .or(vinPage.locator("a, button").filter({ hasText: /^order$/i })).first();
          await orderLink.waitFor({ timeout: 10000 });
          await orderLink.click();
          await vinPage.waitForLoadState("networkidle", { timeout: 15000 });

          pass(`${prefix} Tab Quotation (search customer, save, → Order)`);
        } catch (err) {
          await vinPage.screenshot({ path: `quotation-failure-${VIN}.png` });
          fail(`${prefix} Tab Quotation`, err);
          overallStatus = "failed";
          throw err;
        }

        // ── 13. Tab Order: Place Order ─────────────────────────────────────────
        let orderId = null;
        try {
          await dismissConsentBanner(vinPage);

          // Select random dealer account ID
          const dealerSelect = vinPage.locator("select[name*='dealer'], select[id*='dealer'], select").filter({ hasText: /dealer/i }).first();
          if (await dealerSelect.count() > 0) {
            const dealerOpts = await dealerSelect.evaluate(sel =>
              [...sel.options].filter(o => o.value.trim()).map(o => o.value)
            );
            if (dealerOpts.length > 0) {
              const pick = dealerOpts[Math.floor(Math.random() * dealerOpts.length)];
              await dealerSelect.selectOption(pick);
              await vinPage.waitForTimeout(500);
            }
          }

          // Click "Place Order"
          const placeOrderBtn = vinPage.getByRole("button", { name: /place order/i });
          await placeOrderBtn.waitFor({ timeout: 10000 });
          await placeOrderBtn.click();
          await vinPage.waitForLoadState("networkidle", { timeout: 30000 });

          // Capture Order ID from the page (look for order number / confirmation)
          const orderIdText = await vinPage.locator(
            "[class*='order-id'], [class*='order-number'], [data-testid*='order']"
          ).first().textContent({ timeout: 5000 }).catch(() => null);

          if (orderIdText) {
            const idMatch = orderIdText.match(/[A-Z0-9\-]{6,}/);
            orderId = idMatch?.[0] ?? orderIdText.trim();
          }

          // Fallback: check URL for order ID
          if (!orderId) {
            const urlMatch = vinPage.url().match(/order[/=]([A-Z0-9\-]{6,})/i);
            orderId = urlMatch?.[1] ?? null;
          }

          if (orderId) {
            console.log(`  Order ID: ${orderId}`);
            orderIdsMap[VIN] = orderId;
          } else {
            console.log(`  Order placed but Order ID not captured`);
            orderIdsMap[VIN] = "placed";
          }

          pass(`${prefix} Place Order`, { orderId });
        } catch (err) {
          await vinPage.screenshot({ path: `order-failure-${VIN}.png` });
          fail(`${prefix} Tab Order`, err);
          overallStatus = "failed";
        }

        // ── 14. Download Genuine Care Order Details PDF ────────────────────────
        await dismissConsentBanner(vinPage);
        try {
          const dlBtn = vinPage.locator("button, a").filter({ hasText: /genuine care order|gc order|order details/i }).first();
          await dlBtn.waitFor({ timeout: 15000 });
          const [dl] = await Promise.all([
            vinPage.waitForEvent("download", { timeout: 45000 }),
            dlBtn.click(),
          ]);
          const gcOrderPath = `gc-order-details-${VIN}.pdf`;
          await dl.saveAs(gcOrderPath);
          allPdfPaths.push(gcOrderPath);
          console.log(`  Saved: ${dl.suggestedFilename()}`);
          pass(`${prefix} Download Genuine Care Order Details PDF`);
        } catch (err) {
          fail(`${prefix} Download Genuine Care Order Details PDF`, err);
          overallStatus = "failed";
        }

        // ── 15. Download Maintenance Agreement PDF ────────────────────────────
        await dismissConsentBanner(vinPage);
        try {
          const dlBtn = vinPage.locator("button, a").filter({ hasText: /maintenance agreement/i }).first();
          await dlBtn.waitFor({ timeout: 15000 });
          const [dl] = await Promise.all([
            vinPage.waitForEvent("download", { timeout: 45000 }),
            dlBtn.click(),
          ]);
          const maintPath = `maintenance-agreement-${VIN}.pdf`;
          await dl.saveAs(maintPath);
          allPdfPaths.push(maintPath);
          console.log(`  Saved: ${dl.suggestedFilename()}`);
          pass(`${prefix} Download Maintenance Agreement PDF`);
        } catch (err) {
          fail(`${prefix} Download Maintenance Agreement PDF`, err);
          overallStatus = "failed";
        }

      } catch {
        if (!vinFailed) overallStatus = "failed";
        console.log(`  Skipping remaining steps for ${VIN}`);
      } finally {
        await vinPage.close();
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
        console.log(`  ${r.passed ? "✓" : "✗"} ${r.step}${r.error ? ": " + r.error : ""}`);
      }
      console.log("Order IDs:", orderIdsMap);
    }
  }
}

run().catch(err => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
