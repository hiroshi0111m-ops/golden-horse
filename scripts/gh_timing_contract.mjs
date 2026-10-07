import { chromium } from "playwright-core";
import fs from "fs";

const chrome = process.env.CHROME_BIN;
const url = "http://127.0.0.1:4173/checkpoints/V172_CSP_IMAGE_FIX/index.html";
const report = { url, startedAt: new Date().toISOString(), marks: {}, phaseLog: [] };

function assertRange(name, value, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name}=${value}ms outside ${min}-${max}ms`);
  }
}

const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
page.setDefaultTimeout(10_000);

const pageErrors = [];
page.on("pageerror", error => pageErrors.push(String(error)));

let exitCode = 0;
try {
  const response = await page.goto(url, { waitUntil: "commit", timeout: 15_000 });
  if (!response || response.status() !== 200) throw new Error(`HTTP ${response?.status() ?? "none"}`);
  await page.waitForTimeout(2_500);

  await page.evaluate(() => {
    window.__ghTiming = { marks: {}, phaseLog: [] };
    const mark = (name) => {
      if (!window.__ghTiming.marks[name]) window.__ghTiming.marks[name] = performance.now();
    };
    const phase = document.getElementById("racePhase");
    const result = document.getElementById("finishPanel");
    const race = document.getElementById("raceScreen");

    const recordPhase = () => {
      const value = (phase?.textContent || "").trim();
      window.__ghTiming.phaseLog.push({ value, at: performance.now() });
      if (value === "FANFARE") mark("fanfareShown");
      if (value === "READY") mark("readyShown");
      if (value === "スタート" || value === "START") mark("startShown");
      if (value === "GOAL") mark("goalShown");
    };
    new MutationObserver(recordPhase).observe(phase, { childList: true, subtree: true, characterData: true });
    document.addEventListener("gh:fanfare-ended", () => mark("fanfareEnded"));

    const recordResult = () => {
      const overlay = document.getElementById("finishOverlay");
      const visible = !!result && !result.classList.contains("hidden") &&
        !!overlay && overlay.classList.contains("on") &&
        !!race && race.classList.contains("on") &&
        getComputedStyle(result).display !== "none";
      if (visible) mark("resultVisible");
      if (!visible && window.__ghTiming.marks.resultVisible) mark("resultHidden");
    };
    new MutationObserver(recordResult).observe(result, { attributes: true, attributeFilter: ["class", "style"] });
    new MutationObserver(recordResult).observe(race, { attributes: true, attributeFilter: ["class", "style"] });
    recordPhase();
    recordResult();
  });

  const horse = page.locator("button.horsePick").first();
  await horse.click();
  const five = page.getByRole("button", { name: "5G", exact: true });
  if (await five.count()) await five.first().click();
  const bet = page.locator("#betBtn");
  await bet.click({ force: true });
  const confirm = page.locator("#gh-v141-ok");
  await confirm.waitFor({ state: "visible", timeout: 5_000 });
  await page.waitForTimeout(700);
  await confirm.click();
  await page.waitForFunction(() => {
    const text = (document.getElementById("betSlips")?.innerText || "").trim();
    return text && !/まだ投票はありません/.test(text);
  });

  await page.locator("#skipBtn").click();
  await page.waitForFunction(() => document.getElementById("countdown")?.textContent?.trim() === "10", null, { timeout: 5_000 });
  await page.waitForFunction(() => window.__ghTiming?.marks?.startShown, null, { timeout: 90_000 });

  const runnerCount = await page.locator("#runners .runner").count();
  if (runnerCount !== 7) throw new Error(`runnerCount=${runnerCount}`);

  await page.waitForFunction(() => window.__ghTiming?.marks?.goalShown, null, { timeout: 70_000 });
  await page.waitForFunction(() => window.__ghTiming?.marks?.resultVisible, null, { timeout: 70_000 });
  await page.waitForFunction(() => window.__ghTiming?.marks?.resultHidden, null, { timeout: 70_000 });

  const timing = await page.evaluate(() => window.__ghTiming);
  report.marks = timing.marks;
  report.phaseLog = timing.phaseLog;
  report.runnerCount = runnerCount;
  report.measurements = {
    fanfarePhaseToStartMs: Math.round(timing.marks.startShown - timing.marks.fanfareShown),
    readyToStartMs: Math.round(timing.marks.startShown - timing.marks.readyShown),
    raceStartToGoalMs: Math.round(timing.marks.goalShown - timing.marks.startShown),
    resultVisibleMs: Math.round(timing.marks.resultHidden - timing.marks.resultVisible),
  };

  assertRange("readyToStart", report.measurements.readyToStartMs, 600, 1_000);
  assertRange("raceStartToGoal", report.measurements.raceStartToGoalMs, 30_000, 40_000);
  assertRange("resultVisible", report.measurements.resultVisibleMs, 6_000, 9_000);
  if (pageErrors.length) throw new Error(`page errors: ${pageErrors.join(" | ")}`);
  console.log(`TIMING_CONTRACT=PASS ${JSON.stringify(report.measurements)}`);
} catch (error) {
  exitCode = 1;
  report.error = String(error);
  report.marks = await page.evaluate(() => window.__ghTiming?.marks || {}).catch(() => report.marks);
  report.phaseLog = await page.evaluate(() => window.__ghTiming?.phaseLog || []).catch(() => report.phaseLog);
  console.error(`TIMING_CONTRACT=FAIL ${String(error)}`);
} finally {
  report.pageErrors = pageErrors;
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync("timing-contract-report.json", JSON.stringify(report, null, 2));
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}

process.exit(exitCode);
