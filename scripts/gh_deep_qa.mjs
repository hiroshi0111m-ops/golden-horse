import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import fs from "fs";

const url = "http://127.0.0.1:4173/checkpoints/V166_REWARD_IDEMPOTENCY_LEDGER/index.html";
const viewports = [
  { name: "android-small", width: 360, height: 800 },
  { name: "android-main", width: 390, height: 844 },
  { name: "android-large", width: 412, height: 915 },
  { name: "tablet", width: 768, height: 1024 },
];

const browser = await chromium.launch({ headless: true });
const report = { url, results: [] };

for (const vp of viewports) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", msg => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", err => pageErrors.push(String(err)));

  const row = { ...vp, http: null, responsive: false, consoleErrors, pageErrors, accessibility: null };

  try {
    const response = await page.goto(url, { waitUntil: "commit", timeout: 20000 });
    row.http = response ? response.status() : null;
    await page.waitForTimeout(5000);

    const text = await page.locator("body").innerText({ timeout: 8000 });
    row.responsive = text.trim().length > 0;

    if (row.responsive) {
      const axe = await new AxeBuilder({ page }).analyze();
      row.accessibility = {
        violations: axe.violations.length,
        incomplete: axe.incomplete.length,
        passes: axe.passes.length,
        violationIds: axe.violations.map(v => v.id),
      };
      await page.screenshot({
        path: `deep-qa-${vp.name}.png`,
        fullPage: false,
        timeout: 5000,
      });
    }
  } catch (err) {
    row.error = String(err);
  }

  report.results.push(row);
  console.log(JSON.stringify(row));
  await page.close().catch(() => {});
}

await browser.close().catch(() => {});
fs.writeFileSync("deep-qa-report.json", JSON.stringify(report, null, 2));
console.log("DEEP_QA_REPORT_WRITTEN");
