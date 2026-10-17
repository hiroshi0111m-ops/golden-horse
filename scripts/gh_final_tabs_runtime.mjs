import { chromium } from "playwright";
import fs from "fs";

const url = process.env.GH_FINAL_TABS_URL || "http://127.0.0.1:4173/checkpoints/V173_MOBILE_NAV_SAFE_AREA/index.html";
const expected = [
  { target: "home", label: "ホーム" },
  { target: "startPage", label: "レース" },
  { target: "horse", label: "育成" },
  { target: "campaign", label: "特典" },
  { target: "login", label: "マイページ" },
];
const report = {
  url,
  viewport: { width: 390, height: 844 },
  expected,
  startedAt: new Date().toISOString(),
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: report.viewport,
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
});
const page = await context.newPage();
page.setDefaultTimeout(15_000);

let exitCode = 0;
try {
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  report.http = response?.status() ?? null;
  if (report.http !== 200) throw new Error(`HTTP ${report.http}`);

  const nav = page.locator("nav.gh-v60-nav");
  await nav.waitFor({ state: "visible" });

  report.actual = await nav.locator("button.gh-v60-nav-item").evaluateAll(buttons => buttons.map(button => ({
    target: button.getAttribute("data-page"),
    label: [...button.childNodes]
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent || "")
      .join("")
      .replace(/\s+/g, " ")
      .trim(),
  })));

  if (JSON.stringify(report.actual) !== JSON.stringify(expected)) {
    throw new Error(`final tab contract mismatch: ${JSON.stringify(report.actual)}`);
  }

  report.navigation = {};
  for (const target of ["horse", "campaign", "login", "home"]) {
    await nav.locator(`button[data-page="${target}"]`).click();
    await page.locator(`#${target}.active`).waitFor({ state: "visible" });
    if (!(await nav.isVisible())) throw new Error(`bottom nav hidden on ${target}`);
    report.navigation[target] = "PASS";
  }

  await nav.locator('button[data-page="startPage"]').click();
  const guestEntry = page.locator("#ghFix9Go");
  if (await guestEntry.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await guestEntry.click();
  } else {
    const legacyGuestEntry = page.locator("#ghGuestRace");
    if (await legacyGuestEntry.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await legacyGuestEntry.click();
    }
  }

  await page.locator("button.horsePick").first().waitFor({ state: "visible", timeout: 15_000 });
  if (!(await nav.isVisible())) throw new Error("bottom nav hidden on race BET screen");
  report.navigation.startPage = "PASS";

  await page.screenshot({ path: "final-tabs-390.png", fullPage: false });
  report.pass = true;
  console.log(`FINAL_TABS_RUNTIME=PASS ${JSON.stringify(report.navigation)}`);
} catch (error) {
  exitCode = 1;
  report.pass = false;
  report.error = String(error);
  await page.screenshot({ path: "final-tabs-390-failure.png", fullPage: false }).catch(() => {});
  console.error(`FINAL_TABS_RUNTIME=FAIL ${String(error)}`);
} finally {
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync("final-tabs-runtime-report.json", JSON.stringify(report, null, 2));
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}

process.exit(exitCode);
