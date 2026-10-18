import { chromium, webkit, devices } from "playwright";
import fs from "fs";

const url = process.env.GH_TEST_URL;
if (!url) throw new Error("GH_TEST_URL is required");

const browserName = process.env.GH_BROWSER || "chromium";
const deviceName = process.env.GH_DEVICE || (browserName === "webkit" ? "iPhone 15" : "Pixel 7");
const browserType = browserName === "webkit" ? webkit : chromium;
const { defaultBrowserType: _defaultBrowserType, ...device } = devices[deviceName];
const reportPath = process.env.GH_TIMING_REPORT || `v176-race-timing-${browserName}.json`;
const screenshotPath = process.env.GH_TIMING_SCREENSHOT || `v176-race-timing-${browserName}.png`;
const report = {
  url,
  browserName,
  deviceName,
  note: "Playwright mobile emulation only. This is not physical-device, real LINE in-app-browser, or audio-synchronization evidence.",
  requirement: "Exact V176 guest starts at 1000G, accepts one confirmed 5G BET, starts seven runners, reaches GOAL and OFFICIAL RESULT, keeps natural race timing at 30-40s and the explicit seven-second result hold at 6-9s. Total result-panel visibility is recorded separately because WebKit runs the existing narrated official-result sequence before the hold.",
  startedAt: new Date().toISOString(),
  marks: {},
  phaseLog: [],
  pageErrors: [],
};

function assertRange(name, value, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name}=${value}ms outside ${min}-${max}ms`);
  }
}

const browser = await browserType.launch({ headless: true });
const context = await browser.newContext(device);
const page = await context.newPage();
page.setDefaultTimeout(12_000);
page.on("pageerror", error => report.pageErrors.push(String(error)));

let exitCode = 0;
try {
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  if (!response || response.status() !== 200) throw new Error(`HTTP ${response?.status() ?? "none"}`);
  await page.waitForFunction(() =>
    typeof state !== "undefined" &&
    typeof window.GH_V141 === "object" &&
    document.querySelectorAll("button.horsePick").length === 7
  , null, { timeout: 20_000 });

  report.initialGold = await page.evaluate(() => Number(state.gold));
  report.entryCount = await page.locator("button.horsePick").count();
  if (report.initialGold !== 1000) throw new Error(`initialGold=${report.initialGold}`);
  if (report.entryCount !== 7) throw new Error(`entryCount=${report.entryCount}`);

  await page.evaluate(() => {
    window.__ghTiming = { marks: {}, phaseLog: [] };
    const mark = name => {
      if (!window.__ghTiming.marks[name]) window.__ghTiming.marks[name] = performance.now();
    };
    const phase = document.getElementById("racePhase");
    const result = document.getElementById("finishPanel");
    const race = document.getElementById("raceScreen");
    const resultCountdown = document.getElementById("resultCountdown");

    const recordPhase = () => {
      const value = (phase?.textContent || "").trim();
      window.__ghTiming.phaseLog.push({ value, at: performance.now() });
      if (value === "FANFARE") mark("fanfareShown");
      if (value === "READY") mark("readyShown");
      if (value === "スタート" || value === "START") mark("startShown");
      if (value === "GOAL") mark("goalShown");
    };
    const recordResult = () => {
      const overlay = document.getElementById("finishOverlay");
      const visible = !!result && !result.classList.contains("hidden") &&
        !!overlay && overlay.classList.contains("on") &&
        !!race && race.classList.contains("on") &&
        getComputedStyle(result).display !== "none";
      if (visible) mark("resultVisible");
      if (visible && (resultCountdown?.textContent || "").trim() === "7") mark("resultHoldStarted");
      if (!visible && window.__ghTiming.marks.resultVisible) mark("resultHidden");
    };

    new MutationObserver(recordPhase).observe(phase, { childList: true, subtree: true, characterData: true });
    new MutationObserver(recordResult).observe(result, { attributes: true, attributeFilter: ["class", "style"] });
    new MutationObserver(recordResult).observe(race, { attributes: true, attributeFilter: ["class", "style"] });
    new MutationObserver(recordResult).observe(resultCountdown, { childList: true, subtree: true, characterData: true });
    document.addEventListener("gh:fanfare-ended", () => mark("fanfareEnded"));
    recordPhase();
    recordResult();
  });

  await page.locator("button.horsePick").first().click();
  await page.getByRole("button", { name: "5G", exact: true }).first().click();
  await page.waitForFunction(() => {
    const button = document.getElementById("betBtn");
    return !!button && !button.disabled && !button.classList.contains("gh-v141-notready");
  });
  await page.locator("#betBtn").click();
  await page.locator("#gh-v141-ok").waitFor({ state: "visible", timeout: 5_000 });
  await page.waitForTimeout(700);
  await page.locator("#gh-v141-ok").click();
  await page.waitForFunction(() =>
    typeof state !== "undefined" &&
    Number(state.gold) === 995 &&
    Array.isArray(state.raceBets) &&
    state.raceBets.length === 1
  , null, { timeout: 8_000 });
  report.afterBet = await page.evaluate(() => ({ gold: Number(state.gold), activeBets: state.raceBets.length }));

  await page.locator("#skipBtn").click();
  await page.waitForFunction(() => document.getElementById("countdown")?.textContent?.trim() === "10", null, { timeout: 5_000 });
  await page.waitForFunction(() => window.__ghTiming?.marks?.startShown, null, { timeout: 90_000 });

  report.runnerCount = await page.locator("#runners .runner").count();
  if (report.runnerCount !== 7) throw new Error(`runnerCount=${report.runnerCount}`);

  await page.waitForFunction(() => window.__ghTiming?.marks?.goalShown, null, { timeout: 70_000 });
  await page.waitForFunction(() => window.__ghTiming?.marks?.resultVisible, null, { timeout: 70_000 });
  report.resultText = (await page.locator("#finishPanel").innerText()).trim();
  if (!/OFFICIAL|RESULT|確定/i.test(report.resultText)) throw new Error("OFFICIAL RESULT missing");
  await page.waitForFunction(() => window.__ghTiming?.marks?.resultHoldStarted, null, { timeout: 70_000 });
  await page.waitForFunction(() => window.__ghTiming?.marks?.resultHidden, null, { timeout: 70_000 });

  const timing = await page.evaluate(() => window.__ghTiming);
  report.marks = timing.marks;
  report.phaseLog = timing.phaseLog;
  report.measurements = {
    fanfarePhaseToStartMs: Math.round(timing.marks.startShown - timing.marks.fanfareShown),
    readyToStartMs: Math.round(timing.marks.startShown - timing.marks.readyShown),
    raceStartToGoalMs: Math.round(timing.marks.goalShown - timing.marks.startShown),
    resultNarrationMs: Math.round(timing.marks.resultHoldStarted - timing.marks.resultVisible),
    resultHoldMs: Math.round(timing.marks.resultHidden - timing.marks.resultHoldStarted),
    totalResultPanelMs: Math.round(timing.marks.resultHidden - timing.marks.resultVisible),
  };

  assertRange("readyToStart", report.measurements.readyToStartMs, 600, 1_000);
  assertRange("raceStartToGoal", report.measurements.raceStartToGoalMs, 30_000, 40_000);
  assertRange("resultHold", report.measurements.resultHoldMs, 6_000, 9_000);
  if (report.pageErrors.length) throw new Error(`page errors: ${report.pageErrors.join(" | ")}`);
  report.status = "PASS";
  console.log(`V176_RACE_TIMING=PASS browser=${browserName} device=${deviceName} ${JSON.stringify(report.measurements)}`);
} catch (error) {
  exitCode = 1;
  report.status = "FAIL";
  report.error = String(error);
  report.marks = await page.evaluate(() => window.__ghTiming?.marks || {}).catch(() => report.marks);
  report.phaseLog = await page.evaluate(() => window.__ghTiming?.phaseLog || []).catch(() => report.phaseLog);
  console.error(`V176_RACE_TIMING=FAIL browser=${browserName} device=${deviceName} ${String(error)}`);
} finally {
  report.finishedAt = new Date().toISOString();
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}

process.exit(exitCode);
