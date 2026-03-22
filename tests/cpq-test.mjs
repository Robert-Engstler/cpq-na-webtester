/**
 * CPQ End-to-End Test Script
 *
 * Runs a full CPQ quote flow for one or more VINs and a language.
 * Executed by GitHub Actions via workflow_dispatch.
 *
 * Required env vars:
 *   VINS           - Comma-separated Vehicle Identification Numbers (or VIN for single)
 *   LANGUAGE       - "en" or "de"
 *   RUN_ID         - UUID of the test_run DB record to update
 *   TEST_USERNAME  - CPQ site login username
 *   TEST_PASSWORD  - CPQ site login password
 *   WEBHOOK_URL    - Full URL to POST results to
 *   WEBHOOK_SECRET - Bearer token for webhook auth
 */

import { chromium } from "playwright";
import { readFileSync, existsSync } from "fs";
import { execSync } from "child_process";

// ── Environment ──────────────────────────────────────────────────────────────

// Load .env.local for local runs (provides TEST_USERNAME, TEST_PASSWORD, etc.)
try {
  const envFile = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of envFile.split("\n")) {
    const m = line.match(/^([A-Z_]+)=["']?(.+?)["']?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch { /* .env.local not present (e.g. in CI) — env vars must be set externally */ }

// Parse VIN list: VINS (comma-separated) takes priority, fall back to single VIN
const vinList = (process.env.VINS ?? process.env.VIN ?? "")
  .split(",")
  .map(v => v.trim())
  .filter(Boolean);

const LANGUAGE = process.env.LANGUAGE ?? "en";
const LOCALE_MAP = { en: "en_GB", de: "de_DE" };
const LOCALE = LOCALE_MAP[LANGUAGE] ?? "en_GB";
const RUN_ID = process.env.RUN_ID;
const TEST_USERNAME = process.env.TEST_USERNAME;
const TEST_PASSWORD = process.env.TEST_PASSWORD;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

if (vinList.length === 0 || !TEST_USERNAME || !TEST_PASSWORD) {
  console.error("Missing required environment variables (VINS or VIN, TEST_USERNAME, TEST_PASSWORD)");
  process.exit(1);
}
if (!WEBHOOK_URL || !WEBHOOK_SECRET || !RUN_ID) {
  console.warn("⚠ Webhook vars missing — running in local mode (results will not be posted)");
}

console.log(`VINs to process: ${vinList.join(", ")}`);

// ── Step tracking ─────────────────────────────────────────────────────────────

const results = [];

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
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${WEBHOOK_SECRET}`,
      },
      body: JSON.stringify({
        run_id: RUN_ID,
        status,
        result_json: results,
        pdf_url: pdfZipUrl || undefined,
      }),
    });
    if (!res.ok) console.error(`Webhook responded with ${res.status}`);
    else console.log(`Results posted — status: ${status}`);
  } catch (err) {
    console.error("Failed to post results to webhook:", err);
  }
}

// ── Blob upload ──────────────────────────────────────────────────────────

async function uploadToBlob(filePath, filename, contentType = "application/pdf") {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return null; // skip in local mode
  const body = readFileSync(filePath);
  const res = await fetch(`https://blob.vercel-storage.com/${filename}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-api-version": "7",
      "x-content-type": contentType,
    },
    body,
  });
  if (!res.ok) {
    console.error(`Blob upload failed: ${res.status}`);
    return null;
  }
  const { url } = await res.json();
  console.log(`  Uploaded to Blob: ${url}`);
  return url;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// The TrustArc consent banner (#consent_blackbar) appears on CPQ pages and
// intercepts clicks. Remove it from the DOM entirely before interacting.
async function dismissConsentBanner(page) {
  await page.evaluate(() => {
    document.getElementById("consent_blackbar")?.remove();
  });
}

// VIN label for step prefixes — use full VIN for clarity in logs
function vinLabel(vin) {
  return vin;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  const headless = process.env.HEADLESS !== "false";
  // Use Edge when running headful on Windows — Playwright's bundled Chromium
  // has login issues in headful mode on Windows.
  const channel = !headless && process.platform === "win32" ? "msedge" : undefined;
  const browser = await chromium.launch({ headless, channel });
  // acceptDownloads: true is required for page.waitForEvent("download") to work
  const context = await browser.newContext({ acceptDownloads: true });
  // Block TrustArc consent scripts entirely — removing the DOM banner is not
  // enough; the TrustArc JS keeps running and can intercept button clicks.
  await context.route(/trustarc|truste\.com|consent\.js/i, route => route.abort());
  const page = await context.newPage();
  let overallStatus = "complete";
  const allPdfPaths = [];

  try {
    // ── 1. Login (once for all VINs) ──────────────────────────────────────────
    try {
      await page.goto(
        `https://cpq.agcocorp.com/agco/dealer/${LOCALE}/aftersales/dashboard`,
        { waitUntil: "networkidle", timeout: 30000 }
      );

      const usernameField = page.getByRole("textbox", { name: "User Name" });
      if (await usernameField.isVisible({ timeout: 5000 })) {
        await usernameField.fill(TEST_USERNAME);
        await page.waitForTimeout(1000);
        await page.locator("input[type='password']").fill(TEST_PASSWORD);
        await page.waitForTimeout(1000);
        await page.getByRole("button", { name: "Log in" }).click();
        await page.waitForURL(/cpq\.agcocorp\.com\/agco\/dealer/, { timeout: 30000 });
        await page.waitForLoadState("load", { timeout: 20000 });
      }

      pass("Login");
    } catch (err) {
      await page.screenshot({ path: "login-failure.png" });
      fail("Login", err);
      overallStatus = "failed";
      throw err; // fatal — nothing else can run
    }

    // ── 2. Accept cookies (once for all VINs) ─────────────────────────────────
    try {
      const btn = page.getByRole("button", { name: "Required Cookies Only" });
      if (await btn.isVisible({ timeout: 5000 })) {
        await btn.click();
      }
      pass("Accept cookies");
    } catch {
      pass("Accept cookies"); // banner may not appear on every session
    }

    // Close the login page — each VIN will open its own fresh tab
    await page.close();

    // ── VIN loop ──────────────────────────────────────────────────────────────
    // Each VIN gets a fresh page (tab) within the same browser context.
    // This avoids stale state from the previous VIN's configuration while
    // keeping login cookies (which live on the context, not the page).
    for (const VIN of vinList) {
      const prefix = `[${vinLabel(VIN)}]`;
      console.log(`\n── Processing ${VIN} ──`);
      const vinPage = await context.newPage();

      try {
        // ── 3. VIN search ─────────────────────────────────────────────────────
        try {
          await vinPage.goto(
            `https://cpq.agcocorp.com/agco/dealer/${LOCALE}/aftersales/dashboard`,
            { waitUntil: "load", timeout: 30000 }
          );

          const vinText = vinPage.getByText("Enter your VIN/ Serial Number");
          if (await vinText.isVisible({ timeout: 5000 })) {
            await vinText.click();
          }

          await vinPage.getByRole("textbox", { name: "Enter your VIN/ Serial Number" }).fill(VIN);
          await vinPage.locator("form").getByRole("button").filter({ hasText: /^$/ }).click();
          await vinPage.waitForURL(/\/aftersales\/accessories\//, { timeout: 20000 });
          pass(`${prefix} VIN search`);
        } catch (err) {
          await vinPage.screenshot({ path: `vin-search-failure-${VIN}.png` });
          fail(`${prefix} VIN search`, err);
          overallStatus = "failed";
          throw err; // skip remaining steps for this VIN
        }

        // Extract productId and quoteId from URL
        const accessoriesUrl = vinPage.url();
        const urlMatch = accessoriesUrl.match(/\/accessories\/([^/]+)\/overview\/([^/?#]+)/);
        const productId = urlMatch?.[1];
        const quoteId = urlMatch?.[2];
        console.log(`  productId=${productId}  quoteId=${quoteId}`);

        // ── 4. Select Maintenance service ─────────────────────────────────────
        try {
          await vinPage.getByRole("img", { name: /maintenance/i }).click();
          await vinPage.waitForURL(/\/aftersales\/services\//, { timeout: 20000 });
          pass(`${prefix} Select Maintenance service`);
        } catch (err) {
          await vinPage.screenshot({ path: `maintenance-failure-${VIN}.png` });
          fail(`${prefix} Select Maintenance service`, err);
          overallStatus = "failed";
          throw err;
        }

        // ── 5 & 6. Select service configuration options ───────────────────────
        await dismissConsentBanner(vinPage);
        try {
          const optionGroups = vinPage.locator("div.options-list");
          await optionGroups.first().waitFor({ timeout: 15000 });
          const groupCount = await optionGroups.count();
          for (let i = 0; i < groupCount; i++) {
            const group = optionGroups.nth(i);
            if (!(await group.isVisible())) continue;

            const radioLabels = group.locator("label").filter({
              has: vinPage.locator("input[type='radio']"),
            });
            const labelCount = await radioLabels.count();
            if (labelCount === 0) continue;

            const multiService = radioLabels.filter({ hasText: "Multi Service" });
            const hasMultiService = await multiService.count() > 0;

            if (hasMultiService) {
              const alreadySelected = await multiService.first().locator("input[type='radio']").isChecked();
              if (!alreadySelected) {
                console.log("  Clicking Multi Service");
                await multiService.first().click();
                await vinPage.waitForTimeout(1200);

                // If a service of the other type already exists for this VIN,
                // a confirmation pop-up appears. Always click "Yes" to proceed.
                const yesBtn = vinPage.getByRole("button", { name: "Yes" });
                if (await yesBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                  console.log("  Service conflict pop-up detected — clicking Yes");
                  await yesBtn.click();
                  await vinPage.waitForTimeout(1200);
                }
              } else {
                console.log("  Multi Service already selected");
              }
            } else {
              let anyChecked = false;
              for (let j = 0; j < labelCount; j++) {
                if (await radioLabels.nth(j).locator("input[type='radio']").isChecked()) {
                  anyChecked = true;
                  break;
                }
              }
              if (!anyChecked) {
                const randomIdx = Math.floor(Math.random() * labelCount);
                await radioLabels.nth(randomIdx).click();
                await vinPage.waitForTimeout(400);
              }
            }
          }

          // Phase B: spec sections (e.g. Valtra Cab Filter, Coolant, Engine Oil)
          // Specs showing "Choose An Option" were NOT pre-populated by sales codes
          // and require manual selection. Track each one for yellow VIN reporting.
          const manualSpecs = [];
          for (let attempt = 0; attempt < 8; attempt++) {
            const specHeaders = vinPage.locator("div.variable-panel div.header").filter({ hasText: "Choose An Option" });
            const specCount = await specHeaders.count();
            if (specCount === 0) break;

            const header = specHeaders.first();
            if (!(await header.isVisible())) { await vinPage.waitForTimeout(400); continue; }

            // Extract spec name from header text (e.g. "Front AxleChoose An Option" → "Front Axle")
            const headerText = (await header.textContent() ?? "").replace("Choose An Option", "").trim();
            if (headerText) manualSpecs.push(headerText);

            await header.scrollIntoViewIfNeeded();
            await header.click();
            await vinPage.waitForTimeout(800);

            const specOptions = vinPage.locator(".option-container .option-name");
            const rCount = await specOptions.count();
            if (rCount > 0) {
              const pick = Math.floor(Math.random() * rCount);
              const optText = (await specOptions.nth(pick).textContent() ?? "").trim().substring(0, 50);
              console.log(`  Manual spec: ${headerText} → ${optText}`);
              await specOptions.nth(pick).click();
              await vinPage.waitForTimeout(600);
            }
          }

          if (manualSpecs.length > 0) {
            pass(`${prefix} Select service options — manual spec selection: ${manualSpecs.join(", ")}`, { hadManualSpec: true, manualSpecs });
          } else {
            pass(`${prefix} Select service options`);
          }
        } catch (err) {
          fail(`${prefix} Select service options`, err);
          overallStatus = "failed";
        }

        // ── 7. Configure Multi Service conditions ──────────────────────────
        // Multi Service shows 3 dropdowns (all class select-dropdown-duration):
        //   [0] Start Service (Machine Start Hour) — pick first non-empty option
        //   [1] Last Service (List Service Intervals) — pick last non-empty option
        //   [2] Duration (Contract duration) — pick value "5"
        // Each selection triggers a spinner; wait for it before proceeding.
        await dismissConsentBanner(vinPage);
        try {
          const durationCombos = vinPage.locator("select.select-dropdown-duration");
          await vinPage.waitForFunction(() => {
            const sels = document.querySelectorAll("select.select-dropdown-duration");
            return sels.length >= 3 && sels[0].options.length > 0;
          }, { timeout: 20000 });

          await vinPage.waitForFunction(() => {
            const spinner = document.querySelector("span.page-unload-anim");
            return !spinner || spinner.offsetParent === null;
          }, { timeout: 20000 });
          await vinPage.waitForTimeout(1000);

          // Helper: wait for spinner to disappear after a selection
          const waitForSpinner = () => vinPage.waitForFunction(() => {
            const spinner = document.querySelector("span.page-unload-anim");
            return !spinner || spinner.offsetParent === null;
          }, { timeout: 30000 });

          // [0] Start Service — first non-empty option
          const startSvc = durationCombos.nth(0);
          await startSvc.scrollIntoViewIfNeeded();
          const startOpts = await startSvc.evaluate(sel =>
            [...sel.options].filter(o => o.value && o.value.trim() !== "").map(o => o.value)
          );
          if (startOpts.length > 0) {
            console.log(`  Start Service: selecting "${startOpts[0]}"`);
            await startSvc.selectOption(startOpts[0]);
            await vinPage.waitForTimeout(500);
            await waitForSpinner();
            await vinPage.waitForTimeout(500);
          }

          // [1] Last Service — last non-empty option
          const lastSvc = durationCombos.nth(1);
          await lastSvc.scrollIntoViewIfNeeded();
          const lastOpts = await lastSvc.evaluate(sel =>
            [...sel.options].filter(o => o.value && o.value.trim() !== "").map(o => o.value)
          );
          if (lastOpts.length > 0) {
            console.log(`  Last Service: selecting "${lastOpts[lastOpts.length - 1]}"`);
            await lastSvc.selectOption(lastOpts[lastOpts.length - 1]);
            await vinPage.waitForTimeout(500);
            await waitForSpinner();
            await vinPage.waitForTimeout(500);
          }

          // [2] Duration — select value "5"
          const duration = durationCombos.nth(2);
          await duration.scrollIntoViewIfNeeded();
          console.log(`  Duration: selecting "5"`);
          await duration.selectOption("5");
          await vinPage.waitForTimeout(500);
          await waitForSpinner();
          await vinPage.waitForTimeout(1000);

          // Machine Start Hour must be >= 1 (defaults to 0 which is invalid).
          // It's a text input near the "Machine Start Hour" label — clear and type "1".
          const startHourInput = vinPage.locator("xpath=//span[contains(text(),'Machine Start Hour')]/ancestor::div[contains(@class,'input-box')]//input");
          const startHourCount = await startHourInput.count();
          if (startHourCount > 0) {
            await startHourInput.first().scrollIntoViewIfNeeded();
            await startHourInput.first().click({ clickCount: 3 }); // select all
            await startHourInput.first().fill("1");
            console.log(`  Machine Start Hour: set to 1`);
            await vinPage.waitForTimeout(500);
            await waitForSpinner();
            await vinPage.waitForTimeout(1000);
          } else {
            console.log(`  Machine Start Hour input not found — skipping`);
          }

          // Log Total Price if visible
          const totalPrice = await vinPage.evaluate(() => {
            const els = [...document.querySelectorAll("*")]
              .filter(el => el.offsetParent !== null && el.childElementCount === 0)
              .filter(el => /total.*price|price.*total/i.test(el.textContent) && el.textContent.trim().length < 60);
            return els.map(el => el.textContent.trim());
          });
          if (totalPrice.length > 0) {
            console.log(`  Total Price: ${totalPrice.join(", ")}`);
          }

          pass(`${prefix} Configure Multi Service conditions`);
        } catch (err) {
          fail(`${prefix} Configure Multi Service conditions`, err);
          overallStatus = "failed";
        }

        // ── 8. Apply Changes → Add to Configuration → Summary ────────────
        await dismissConsentBanner(vinPage);
        try {
          const applyBtn = vinPage.getByRole("button", { name: "Apply Changes" });
          await applyBtn.scrollIntoViewIfNeeded();
          await vinPage.screenshot({ path: `before-apply-${VIN}.png` });
          await applyBtn.click();

          // Wait for spinner to finish after Apply Changes
          await vinPage.waitForFunction(() => {
            const spinner = document.querySelector("span.page-unload-anim");
            return !spinner || spinner.offsetParent === null;
          }, { timeout: 60000 });
          await vinPage.waitForTimeout(1000);

          // Multi Service: after Apply Changes the page stays on Configuration
          // and shows "ADD TO CONFIGURATION". Sometimes the first click doesn't
          // advance — retry Apply Changes once if the button doesn't appear.
          await dismissConsentBanner(vinPage);
          const addToConfigBtn = vinPage.getByRole("button", { name: "Add to Configuration" });
          const appeared = await addToConfigBtn.waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
          if (!appeared) {
            console.log(`  Add to Configuration not visible — retrying Apply Changes`);
            await dismissConsentBanner(vinPage);
            const applyRetry = vinPage.getByRole("button", { name: "Apply Changes" });
            const applyStillExists = await applyRetry.count() > 0;
            if (applyStillExists) {
              await applyRetry.scrollIntoViewIfNeeded();
              await applyRetry.click();
              await vinPage.waitForFunction(() => {
                const spinner = document.querySelector("span.page-unload-anim");
                return !spinner || spinner.offsetParent === null;
              }, { timeout: 60000 });
              await vinPage.waitForTimeout(1000);
            }
            await addToConfigBtn.waitFor({ timeout: 60000 });
          }
          console.log(`  Clicking Add to Configuration`);
          await addToConfigBtn.click();

          // Wait for spinner then Summary page (Save button appears)
          await vinPage.waitForFunction(() => {
            const spinner = document.querySelector("span.page-unload-anim");
            return !spinner || spinner.offsetParent === null;
          }, { timeout: 60000 });
          await dismissConsentBanner(vinPage);
          await vinPage.getByRole("button", { name: "Save" }).first().waitFor({ timeout: 60000 });
          pass(`${prefix} Apply changes`);
        } catch (err) {
          await vinPage.screenshot({ path: `apply-failure-${VIN}.png` });
          fail(`${prefix} Apply changes`, err);
          overallStatus = "failed";
          throw err; // fatal for this VIN — must be on Summary page
        }

        // ── 9. Save Config ───────────────────────────────────────────────────
        await dismissConsentBanner(vinPage);
        try {
          await vinPage.locator("button.btn-secondary-cta.btn-with-icon").click();
          const dialogSave = vinPage.locator(".modal-content button.btn-primary.float-end:not([disabled])");
          await dialogSave.waitFor({ timeout: 10000 });
          await dialogSave.click();
          await vinPage.waitForURL(/\/configure\/CONFIG/, { timeout: 15000 });

          // Extract config ID from URL (format: /configure/CONFIGxxxxxxxx)
          const configMatch = vinPage.url().match(/(CONFIG\d+)/);
          const configId = configMatch ? configMatch[1] : null;
          const configUrl = vinPage.url();
          if (configId) {
            console.log(`  Config ID: ${configId}`);
            console.log(`  Config URL: ${configUrl}`);
            pass(`${prefix} Save Config`, { configId, configUrl });
          } else {
            pass(`${prefix} Save Config`);
          }
        } catch (err) {
          fail(`${prefix} Save Config`, err);
          overallStatus = "failed";
        }

        // ── 10. Download PartsPicklist PDF ────────────────────────────────────
        await dismissConsentBanner(vinPage);
        try {
          const downloadBtns = vinPage.locator("button").filter({ hasText: /download/i });
          await downloadBtns.first().waitFor({ timeout: 15000 });
          const [dl] = await Promise.all([
            vinPage.waitForEvent("download", { timeout: 45000 }),
            downloadBtns.nth(1).click(),
          ]);
          console.log(`  Saved: ${dl.suggestedFilename()}`);
          const partsPath = `parts-picklist-${VIN}.pdf`;
          await dl.saveAs(partsPath);
          allPdfPaths.push(partsPath);
          pass(`${prefix} Download PartsPicklist PDF`);
        } catch (err) {
          await vinPage.screenshot({ path: `download-parts-failure-${VIN}.png` });
          fail(`${prefix} Download PartsPicklist PDF`, err);
          overallStatus = "failed";
        }

        // ── 11. Download ServiceChecklist PDF ─────────────────────────────────
        await dismissConsentBanner(vinPage);
        try {
          const downloadBtns = vinPage.locator("button").filter({ hasText: /download/i });
          const [dl] = await Promise.all([
            vinPage.waitForEvent("download", { timeout: 45000 }),
            downloadBtns.nth(2).click(),
          ]);
          console.log(`  Saved: ${dl.suggestedFilename()}`);
          const svcPath = `service-checklist-${VIN}.pdf`;
          await dl.saveAs(svcPath);
          allPdfPaths.push(svcPath);
          pass(`${prefix} Download ServiceChecklist PDF`);
        } catch (err) {
          await vinPage.screenshot({ path: `download-service-failure-${VIN}.png` });
          fail(`${prefix} Download ServiceChecklist PDF`, err);
          overallStatus = "failed";
        }

      } catch {
        // Per-VIN fatal error — already recorded above, continue to next VIN
        overallStatus = "failed";
        console.log(`  Skipping remaining steps for ${VIN}`);
      } finally {
        await vinPage.close();
      }
    } // end VIN loop

  } catch {
    // Login failure — already recorded above
    overallStatus = "failed";
  } finally {
    await browser.close();

    // ── Zip all PDFs and upload ───────────────────────────────────────────────
    let pdfZipUrl = null;
    const existingPdfs = allPdfPaths.filter(p => existsSync(p));
    if (existingPdfs.length > 0) {
      try {
        const zipPath = "pdfs.zip";
        // Use zip on Linux (CI), tar on Windows (local dev)
        if (process.platform === "win32") {
          execSync(`tar -acf ${zipPath} ${existingPdfs.join(" ")}`);
        } else {
          execSync(`zip -j ${zipPath} ${existingPdfs.join(" ")}`);
        }
        console.log(`\nZipped ${existingPdfs.length} PDFs into ${zipPath}`);
        pdfZipUrl = await uploadToBlob(zipPath, `${RUN_ID}/pdfs.zip`, "application/zip");
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
      if (pdfZipUrl) console.log(`\nPDF zip URL: ${pdfZipUrl}`);
    }
  }
}

run().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
