import { chromium, devices } from "playwright";
import fs from "fs";

const url = process.env.GH_TEST_URL;
if (!url) throw new Error("GH_TEST_URL is required");

const { defaultBrowserType: _defaultBrowserType, ...pixel } = devices["Pixel 7"];
const report = {
  version: "V176 LINE LIFECYCLE FIX candidate",
  checkpoint: "CP_V176_MULTITAB_SETTLEMENT_3X_PASS",
  url,
  requirement: "BET must fail closed while the client is offline; Gold and active BET state must remain unchanged without authoritative server confirmation.",
  scope: "Android Chrome emulation against checksum-pinned V176. This is current-client evidence, not production-server or physical-device evidence.",
  startedAt: new Date().toISOString(),
  pageErrors: [],
};

function readState(page) {
  return page.evaluate(() => ({
    online: navigator.onLine,
    gold: typeof state !== "undefined" ? Number(state.gold) : null,
    activeBets:
      typeof state !== "undefined" && Array.isArray(state.raceBets)
        ? state.raceBets.length
        : null,
    betHistory:
      typeof state !== "undefined" && Array.isArray(state.betHistory)
        ? state.betHistory.length
        : null,
    modalOn: !!document
      .getElementById("gh-v141-confirm")
      ?.classList.contains("on"),
    buildMarker: document
      .querySelector('meta[name="gh-build-candidate"]')
      ?.getAttribute("content") || null,
  }));
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext(pixel);
const page = await context.newPage();
page.setDefaultTimeout(10_000);
page.on("pageerror", error => report.pageErrors.push(String(error)));

let exitCode = 0;
try {
  const response = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  if (response?.status() !== 200) {
    throw new Error(`HTTP ${response?.status() ?? "none"}`);
  }
  await page.waitForFunction(
    () =>
      typeof window.GH_V141 === "object" &&
      typeof window.GH_V166_REWARD_IDEMPOTENCY_LEDGER === "object" &&
      document.querySelectorAll("button.horsePick").length === 7,
    null,
    { timeout: 20_000 },
  );

  report.before = await readState(page);
  if (
    report.before.buildMarker !== "V176-LINE-LIFECYCLE-FIX" ||
    report.before.gold !== 1000 ||
    report.before.activeBets !== 0
  ) {
    throw new Error(`invalid initial V176 state: ${JSON.stringify(report.before)}`);
  }

  await page.locator("button.horsePick").first().click();
  await page.getByRole("button", { name: "5G", exact: true }).first().click();
  await page.waitForFunction(() => {
    const button = document.getElementById("betBtn");
    return !!button && !button.disabled && !button.classList.contains("gh-v141-notready");
  });
  await page.locator("#betBtn").click();

  const confirm = page.locator("#gh-v141-ok");
  await confirm.waitFor({ state: "visible", timeout: 5_000 });
  await page.waitForTimeout(700);

  await context.setOffline(true);
  await page.waitForFunction(() => navigator.onLine === false);
  report.offlineBeforeConfirm = await readState(page);

  await confirm.click();
  await page.waitForTimeout(750);
  report.offlineResult = await readState(page);

  report.failClosed =
    report.offlineResult.online === false &&
    report.offlineResult.gold === 1000 &&
    report.offlineResult.activeBets === 0;

  await context.setOffline(false);
  report.reconnected = true;

  if (!report.failClosed) {
    throw new Error(
      `V176_OFFLINE_BET_ACCEPTED_CLIENT_SIDE online=${report.offlineResult.online} gold=${report.offlineResult.gold} activeBets=${report.offlineResult.activeBets}`,
    );
  }
  if (report.pageErrors.length) {
    throw new Error(`page errors: ${report.pageErrors.join(" | ")}`);
  }

  report.pass = true;
  console.log(`V176_OFFLINE_BET_QA=PASS ${JSON.stringify(report)}`);
  await page.screenshot({
    path: "v176-offline-bet-qa-pass.png",
    fullPage: false,
  });
} catch (error) {
  await context.setOffline(false).catch(() => {});
  exitCode = 1;
  report.pass = false;
  report.error = String(error);
  console.error(`V176_OFFLINE_BET_QA=FAIL ${String(error)}`);
  await page
    .screenshot({
      path: "v176-offline-bet-qa-failure.png",
      fullPage: false,
    })
    .catch(() => {});
} finally {
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(
    "v176-offline-bet-qa-report.json",
    JSON.stringify(report, null, 2),
  );
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}

process.exit(exitCode);
