import { chromium, devices } from "playwright";
import fs from "fs";

const url = process.env.GH_TEST_URL;
if (!url) throw new Error("GH_TEST_URL is required");

const { defaultBrowserType: _defaultBrowserType, ...pixel } = devices["Pixel 7"];
const report = {
  url,
  note: "Android Chrome emulation only; this is not physical-device or real LINE evidence.",
  startedAt: new Date().toISOString(),
  initial: null,
  accepted: null,
  afterAcceptedReload: null,
  settledBeforeNext: null,
  afterNext: null,
  afterSettledReload: null,
  storage: {},
  pageErrors: [],
};

function readState(page) {
  return page.evaluate(() => ({
    gold: typeof state !== "undefined" ? Number(state.gold) : null,
    activeBets: typeof state !== "undefined" && Array.isArray(state.raceBets) ? state.raceBets.length : null,
    betHistory: typeof state !== "undefined" && Array.isArray(state.betHistory) ? state.betHistory.length : null,
    settled: typeof raceState !== "undefined" ? !!raceState.settled : null,
    running: typeof raceState !== "undefined" ? !!raceState.running : null,
    transitioning: typeof raceState !== "undefined" ? !!raceState.transitioning : null,
    countdown: (document.getElementById("countdown")?.textContent || "").trim(),
    finishOn: !!document.getElementById("finishOverlay")?.classList.contains("on"),
  }));
}

function readStorage(page) {
  return page.evaluate(() => ({
    local: Object.fromEntries(Array.from({ length: localStorage.length }, (_, index) => {
      const key = localStorage.key(index);
      const value = key === null ? null : localStorage.getItem(key);
      return [key, value === null ? null : value.length];
    }).filter(([key]) => key !== null)),
    session: Object.fromEntries(Array.from({ length: sessionStorage.length }, (_, index) => {
      const key = sessionStorage.key(index);
      const value = key === null ? null : sessionStorage.getItem(key);
      return [key, value === null ? null : value.length];
    }).filter(([key]) => key !== null)),
  }));
}

async function waitReady(page) {
  await page.waitForFunction(() =>
    typeof window.GH_V141 === "object" &&
    typeof window.GH_V166_REWARD_IDEMPOTENCY_LEDGER === "object" &&
    typeof state !== "undefined" &&
    document.querySelectorAll("button.horsePick").length === 7
  , null, { timeout: 20_000 });
}

async function placeFiveGoldBet(page) {
  await page.locator("button.horsePick").first().click();
  await page.getByRole("button", { name: "5G", exact: true }).first().click();
  await page.waitForFunction(() => {
    const button = document.getElementById("betBtn");
    return !!button && !button.disabled && !button.classList.contains("gh-v141-notready");
  });
  await page.locator("#betBtn").click();
  await page.locator("#gh-v141-ok").waitFor({ state: "visible", timeout: 5_000 });
  await page.locator("#gh-v141-ok").click();
  await page.waitForFunction(() =>
    typeof state !== "undefined" &&
    Number(state.gold) === 995 &&
    Array.isArray(state.raceBets) &&
    state.raceBets.length === 1
  , null, { timeout: 8_000 });
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext(pixel);
const page = await context.newPage();
page.setDefaultTimeout(12_000);
page.on("pageerror", error => report.pageErrors.push(String(error)));

let exitCode = 0;
try {
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  if (response?.status() !== 200) throw new Error(`HTTP ${response?.status() ?? "none"}`);
  await waitReady(page);

  report.initial = await readState(page);
  if (report.initial.gold !== 1000 || report.initial.activeBets !== 0 || report.initial.betHistory !== 0) {
    throw new Error(`invalid initial state ${JSON.stringify(report.initial)}`);
  }

  await placeFiveGoldBet(page);
  report.accepted = await readState(page);
  report.storage.beforeAcceptedReload = await readStorage(page);
  if (report.accepted.gold !== 995 || report.accepted.activeBets !== 1 || report.accepted.betHistory !== 0) {
    throw new Error(`invalid accepted state ${JSON.stringify(report.accepted)}`);
  }
  await page.screenshot({ path: "reload-continuity-before-accepted-reload.png", fullPage: false });

  await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
  await waitReady(page);
  report.afterAcceptedReload = await readState(page);
  report.storage.afterAcceptedReload = await readStorage(page);
  if (
    report.afterAcceptedReload.gold !== 995 ||
    report.afterAcceptedReload.activeBets !== 1 ||
    report.afterAcceptedReload.betHistory !== 0
  ) {
    throw new Error(
      `ACCEPTED_BET_RELOAD_INCONSISTENT ${JSON.stringify(report.afterAcceptedReload)}`
    );
  }

  const skip = page.locator("#skipBtn");
  if (!await skip.isVisible().catch(() => false)) {
    await page.locator('button.gh-v60-nav-item[data-page="startPage"]').click();
    await skip.waitFor({ state: "visible", timeout: 5_000 });
  }
  await skip.click();
  await page.waitForFunction(() => document.getElementById("raceScreen")?.classList.contains("on"), null, { timeout: 25_000 });
  const runners = await page.locator("#runners .runner").count();
  if (runners !== 7) throw new Error(`runner count=${runners}`);

  await page.waitForFunction(() => {
    const overlay = document.getElementById("finishOverlay");
    const panel = document.getElementById("finishPanel");
    return !!overlay?.classList.contains("on") &&
      !panel?.classList.contains("hidden") &&
      typeof raceState !== "undefined" &&
      !!raceState.settled;
  }, null, { timeout: 120_000 });

  const resultText = (await page.locator("#finishPanel").innerText()).trim();
  if (!/OFFICIAL|RESULT|確定/i.test(resultText)) throw new Error("official result missing");
  report.settledBeforeNext = await readState(page);

  await page.evaluate(() => {
    const next = document.getElementById("resultNext");
    if (!next) throw new Error("resultNext missing");
    if (!next.disabled) next.click();
  });
  await page.waitForFunction(() => {
    const race = document.getElementById("raceScreen");
    const finish = document.getElementById("finishOverlay");
    return !!race && !race.classList.contains("on") && !!finish && !finish.classList.contains("on");
  }, null, { timeout: 10_000 });

  report.afterNext = await readState(page);
  report.storage.beforeSettledReload = await readStorage(page);
  if (report.afterNext.activeBets !== 0 || report.afterNext.betHistory !== 1) {
    throw new Error(`invalid settled archive ${JSON.stringify(report.afterNext)}`);
  }
  if (!["120", "119"].includes(report.afterNext.countdown)) {
    throw new Error(`next countdown=${report.afterNext.countdown}`);
  }
  const settledGold = report.afterNext.gold;
  await page.screenshot({ path: "reload-continuity-before-settled-reload.png", fullPage: false });

  await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
  await waitReady(page);
  report.afterSettledReload = await readState(page);
  report.storage.afterSettledReload = await readStorage(page);
  if (
    report.afterSettledReload.gold !== settledGold ||
    report.afterSettledReload.activeBets !== 0 ||
    report.afterSettledReload.betHistory !== 1
  ) {
    throw new Error(
      `SETTLED_RELOAD_INCONSISTENT expectedGold=${settledGold} actual=${JSON.stringify(report.afterSettledReload)}`
    );
  }
  if (report.pageErrors.length) throw new Error(`page errors: ${report.pageErrors.join(" | ")}`);

  report.runners = runners;
  report.resultType = resultText.split("\n").slice(0, 2).join(" / ");
  report.pass = true;
  console.log(`RELOAD_CONTINUITY_QA=PASS ${JSON.stringify({
    accepted: report.accepted,
    afterAcceptedReload: report.afterAcceptedReload,
    afterNext: report.afterNext,
    afterSettledReload: report.afterSettledReload,
  })}`);
  await page.screenshot({ path: "reload-continuity-pass.png", fullPage: false });
} catch (error) {
  exitCode = 1;
  report.pass = false;
  report.error = String(error);
  console.error(`RELOAD_CONTINUITY_QA=FAIL ${String(error)}`);
  await page.screenshot({ path: "reload-continuity-failure.png", fullPage: false }).catch(() => {});
} finally {
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync("reload-continuity-qa-report.json", JSON.stringify(report, null, 2));
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}

process.exit(exitCode);
