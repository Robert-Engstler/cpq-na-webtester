/**
 * Exploration script for Multi Service configuration.
 * Goal: discover the exact selectors for Start Service, Last Service, Duration
 * dropdowns that appear after selecting "Multi Service" radio button.
 *
 * Run with: node tests/explore-multi.mjs
 */

import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VIN = "WAM25321H00F01915";
const LOCALE = "en_GB";
const TEST_USERNAME = "cpqproddealeruk@gmail.com";
const TEST_PASSWORD = "Agco2022!";

async function run() {
  const browser = await chromium.launch({ headless: false, slowMo: 400 });
  const context = await browser.newContext({ acceptDownloads: true });
  await context.route(/trustarc|truste\.com|consent\.js/i, route => route.abort());
  const page = await context.newPage();

  // 1. Login
  console.log("1. Login...");
  await page.goto(`https://cpq.agcocorp.com/agco/dealer/${LOCALE}/aftersales/dashboard`, {
    waitUntil: "networkidle", timeout: 30000,
  });
  const usernameField = page.getByRole("textbox", { name: "User Name" });
  if (await usernameField.isVisible({ timeout: 5000 })) {
    await usernameField.fill(TEST_USERNAME);
    await page.getByRole("textbox", { name: "Password" }).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL(/cpq\.agcocorp\.com\/agco\/dealer/, { timeout: 30000 });
    await page.waitForLoadState("load", { timeout: 20000 });
  }
  const cookieBtn = page.getByRole("button", { name: "Required Cookies Only" });
  if (await cookieBtn.isVisible({ timeout: 5000 })) await cookieBtn.click();
  console.log("✓ Login");

  // 2. VIN search
  const vinText = page.getByText("Enter your VIN/ Serial Number");
  if (await vinText.isVisible({ timeout: 5000 })) await vinText.click();
  await page.getByRole("textbox", { name: "Enter your VIN/ Serial Number" }).fill(VIN);
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/aftersales\/accessories\//, { timeout: 20000 });
  console.log("✓ VIN search — URL:", page.url());

  // 3. Maintenance
  await page.getByRole("img", { name: /maintenance/i }).click();
  await page.waitForURL(/\/aftersales\/services\//, { timeout: 20000 });
  console.log("✓ Maintenance — URL:", page.url());

  // 4. Select Multi Service radio button
  console.log("\n4. Looking for Multi Service radio...");
  const optionGroups = page.locator("div.options-list");
  await optionGroups.first().waitFor({ timeout: 15000 });
  const groupCount = await optionGroups.count();
  console.log(`  ${groupCount} option group(s)`);

  for (let i = 0; i < groupCount; i++) {
    const group = optionGroups.nth(i);
    if (!(await group.isVisible())) continue;
    const radioLabels = group.locator("label").filter({ has: page.locator("input[type='radio']") });
    const labelCount = await radioLabels.count();
    for (let j = 0; j < labelCount; j++) {
      const txt = await radioLabels.nth(j).textContent();
      const checked = await radioLabels.nth(j).locator("input[type='radio']").isChecked();
      console.log(`  Group ${i} label ${j}: "${txt.trim()}" checked=${checked}`);
    }

    // Click Multi Service if found
    const multiService = radioLabels.filter({ hasText: "Multi Service" });
    const hasMulti = await multiService.count() > 0;
    if (hasMulti) {
      const alreadySelected = await multiService.first().locator("input[type='radio']").isChecked();
      if (!alreadySelected) {
        console.log("  Clicking Multi Service...");
        await multiService.first().click();
        await page.waitForTimeout(2000);

        // Handle conflict popup
        const yesBtn = page.getByRole("button", { name: "Yes" });
        if (await yesBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          console.log("  Conflict pop-up detected — clicking Yes");
          await yesBtn.click();
          await page.waitForTimeout(2000);
        }
      } else {
        console.log("  Multi Service already selected");
      }
    }
  }

  // Wait for spinner to clear
  console.log("  Waiting for spinner...");
  await page.waitForFunction(() => {
    const spinner = document.querySelector("span.page-unload-anim");
    return !spinner || spinner.offsetParent === null;
  }, { timeout: 20000 });
  await page.waitForTimeout(2000);

  // 5. Dump ALL visible <select> elements
  console.log("\n=== ALL VISIBLE <select> ELEMENTS ===");
  const selects = await page.evaluate(() =>
    [...document.querySelectorAll("select")]
      .filter(el => el.offsetParent !== null)
      .map((el, idx) => {
        // Find nearest label or heading text
        const parent = el.closest(".form-group, .variable-panel, .service-condition, div");
        const label = parent?.querySelector("label, .header, h4, h5, span")?.textContent?.trim()?.substring(0, 60) || "";
        return {
          index: idx,
          id: el.id,
          name: el.name,
          classes: el.className.substring(0, 80),
          label,
          optionCount: el.options.length,
          options: [...el.options].map(o => ({ value: o.value, text: o.text.trim().substring(0, 40) })),
          selectedValue: el.value,
          parentClasses: parent?.className?.substring(0, 80) || "",
        };
      })
  );
  selects.forEach(s => console.log(JSON.stringify(s, null, 2)));

  // 6. Look for "Configure service conditions" section specifically
  console.log("\n=== LOOKING FOR SERVICE CONDITIONS SECTION ===");
  const svcConditions = await page.evaluate(() => {
    const allText = [...document.querySelectorAll("*")]
      .filter(el => el.offsetParent !== null && el.childElementCount === 0)
      .map(el => ({ tag: el.tagName, text: el.textContent.trim(), classes: el.className }))
      .filter(t => /service|condition|start|last|duration|multi/i.test(t.text) && t.text.length < 80);
    return allText;
  });
  svcConditions.forEach(s => console.log(JSON.stringify(s)));

  // Take screenshot
  await page.screenshot({ path: path.join(__dirname, "multi-service-selects.png") });
  console.log("\n  Screenshot saved: tests/multi-service-selects.png");

  console.log("\nPausing 120s for manual inspection...");
  await page.waitForTimeout(120000);
  await browser.close();
}

run().catch(err => { console.error(err); process.exit(1); });
