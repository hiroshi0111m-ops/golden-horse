import { webkit, devices } from "playwright";
import fs from "fs";

const url = process.env.GH_TEST_URL || "http://127.0.0.1:4173/checkpoints/V174_FINAL_FIVE_TABS/index.html";
const runs = Number(process.env.GH_IPHONE_DIAG_RUNS || 3);
const { defaultBrowserType: _defaultBrowserType, ...iphone } = devices["iPhone 15"];

async function snapshot(page) {
  return page.evaluate(() => ({
    now: Date.now(),
    countdown: (document.getElementById("countdown")?.textContent || "").trim(),
    raceOn: !!document.getElementById("raceScreen")?.classList.contains("on"),
    finishOn: !!document.getElementById("finishOverlay")?.classList.contains("on"),
    finishHidden: !!document.getElementById("finishPanel")?.classList.contains("hidden"),
    finishType: (document.getElementById("finishType")?.textContent || "").trim(),
    finishHeadline: (document.getElementById("finishHeadline")?.textContent || "").trim(),
    resultCountdown: (document.getElementById("resultCountdown")?.textContent || "").trim(),
    settled: typeof raceState !== "undefined" ? !!raceState.settled : null,
    transitioning: typeof raceState !== "undefined" ? !!raceState.transitioning : null,
    phaseIndex: typeof raceState !== "undefined" ? raceState.phaseIndex : null,
    currentKey: typeof raceState !== "undefined" ? raceState.currentKey : null,
    activeBets: typeof state !== "undefined" && Array.isArray(state.raceBets) ? state.raceBets.length : null,
    betHistory: typeof state !== "undefined" && Array.isArray(state.betHistory) ? state.betHistory.length : null,
    gold: typeof state !== "undefined" ? Number(state.gold) : null,
  }));
}

async function placeBet(page) {
  await page.locator("button.horsePick").first().click();
  await page.getByRole("button", { name: "5G", exact: true }).first().click();
  await page.waitForFunction(() => {
    const button = document.getElementById("betBtn");
    return !!button && !button.disabled && !button.classList.contains("gh-v141-notready");
  }, null, { timeout: 12_000 });
  const bet = page.locator("#betBtn");
  await bet.scrollIntoViewIfNeeded();
  await bet.click({ timeout: 10_000 });
  const confirm = page.locator("#gh-v141-ok");
  await confirm.waitFor({ state: "visible", timeout: 5_000 });
  await page.waitForTimeout(700);
  await confirm.click();
  await page.waitForFunction(() => {
    const text = (document.getElementById("betSlips")?.textContent || "").trim();
    return text.length > 0 && !text.includes("まだ投票はありません");
  }, null, { timeout: 8_000 });
}

async function runOnce(browser, index) {
  const context = await browser.newContext(iphone);
  const page = await context.newPage();
  page.setDefaultTimeout(12_000);
  const row = { index, timeline: [], pageErrors: [], consoleErrors: [] };
  page.on("pageerror", error => row.pageErrors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") row.consoleErrors.push(message.text()); });

  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    row.http = response?.status() ?? null;
    if (row.http !== 200) throw new Error(`HTTP ${row.http}`);
    await page.waitForFunction(() => {
      const ready = document.readyState === "interactive" || document.readyState === "complete";
      return ready && typeof window.GH_V166_REWARD_IDEMPOTENCY_LEDGER === "object" &&
        typeof window.GH_V141 === "object" && document.querySelectorAll("button.horsePick").length === 7;
    }, null, { timeout: 20_000 });
    await placeBet(page);
    const afterBet = await snapshot(page);
    row.afterBet = afterBet;
    if (afterBet.gold !== 995 || afterBet.activeBets !== 1) throw new Error(`bet state mismatch ${JSON.stringify(afterBet)}`);

    const startedAt = Date.now();
    await page.locator("#skipBtn").click();
    await page.waitForFunction(() => document.getElementById("raceScreen")?.classList.contains("on"), null, { timeout: 25_000 });
    row.runnerCount = await page.locator("#runners .runner").count();
    if (row.runnerCount !== 7) throw new Error(`runner count=${row.runnerCount}`);

    let previous = "";
    let resultSeen = null;
    let returnedWithoutObservedResult = null;
    const deadline = Date.now() + 140_000;
    while (Date.now() < deadline) {
      const stateNow = await snapshot(page);
      const signature = JSON.stringify({
        countdown: stateNow.countdown,
        raceOn: stateNow.raceOn,
        finishOn: stateNow.finishOn,
        finishHidden: stateNow.finishHidden,
        finishType: stateNow.finishType,
        resultCountdown: stateNow.resultCountdown,
        settled: stateNow.settled,
        transitioning: stateNow.transitioning,
        phaseIndex: stateNow.phaseIndex,
        currentKey: stateNow.currentKey,
        activeBets: stateNow.activeBets,
        betHistory: stateNow.betHistory,
      });
      if (signature !== previous) {
        row.timeline.push({ elapsedMs: Date.now() - startedAt, ...stateNow });
        previous = signature;
      }
      if (stateNow.finishOn && !stateNow.finishHidden) {
        resultSeen = stateNow;
        break;
      }
      if (!stateNow.raceOn && !stateNow.finishOn && stateNow.betHistory >= 1 && stateNow.activeBets === 0) {
        returnedWithoutObservedResult = stateNow;
        break;
      }
      await page.waitForTimeout(200);
    }

    if (returnedWithoutObservedResult) {
      throw new Error(`returned to BET without observable result: ${JSON.stringify(returnedWithoutObservedResult)}`);
    }
    if (!resultSeen) throw new Error("result not observed within 140s");
    row.resultSeen = resultSeen;
    if (!resultSeen.settled) throw new Error(`result visible before settlement: ${JSON.stringify(resultSeen)}`);
    if (!/OFFICIAL|RESULT|確定/i.test(`${resultSeen.finishType} ${resultSeen.finishHeadline}`)) {
      throw new Error(`official result missing: ${JSON.stringify(resultSeen)}`);
    }

    row.transitionMode = await page.evaluate(() => {
      const next = document.getElementById("resultNext");
      if (!next) throw new Error("resultNext missing");
      if (next.disabled) return "automatic";
      next.click();
      return "manual";
    });
    await page.waitForFunction(() => {
      const race = document.getElementById("raceScreen");
      const finish = document.getElementById("finishOverlay");
      return !!race && !race.classList.contains("on") && !!finish && !finish.classList.contains("on");
    }, null, { timeout: 10_000 });
    row.final = await snapshot(page);
    if (row.final.betHistory !== 1 || !["120", "119"].includes(row.final.countdown)) {
      throw new Error(`next race state mismatch: ${JSON.stringify(row.final)}`);
    }
    if (row.pageErrors.length || row.consoleErrors.length) {
      throw new Error(`browser errors: ${[...row.pageErrors, ...row.consoleErrors].join(" | ")}`);
    }
    row.pass = true;
    await page.screenshot({ path: `iphone-result-diagnostic-${index}.png`, fullPage: false, timeout: 5_000 });
    console.log(`IPHONE_RESULT_DIAG_${index}=PASS transition=${row.transitionMode}`);
  } catch (error) {
    row.pass = false;
    row.error = String(error);
    row.failureState = await snapshot(page).catch(() => null);
    await page.screenshot({ path: `iphone-result-diagnostic-${index}-failure.png`, fullPage: false, timeout: 5_000 }).catch(() => {});
    console.error(`IPHONE_RESULT_DIAG_${index}=FAIL ${String(error)}`);
  } finally {
    await context.close().catch(() => {});
  }
  return row;
}

const browser = await webkit.launch({ headless: true });
const report = { url, runs, startedAt: new Date().toISOString(), results: [] };
for (let index = 1; index <= runs; index += 1) report.results.push(await runOnce(browser, index));
await browser.close().catch(() => {});
report.finishedAt = new Date().toISOString();
fs.writeFileSync("iphone-result-diagnostic-report.json", JSON.stringify(report, null, 2));
if (report.results.some(result => !result.pass)) process.exit(1);
console.log(`IPHONE_RESULT_DIAGNOSTIC=PASS runs=${runs}`);
