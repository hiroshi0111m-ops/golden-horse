import { chromium, devices } from "playwright";
import fs from "fs";

const url = process.env.GH_TEST_URL;
if (!url) throw new Error("GH_TEST_URL is required");

const { defaultBrowserType: _defaultBrowserType, ...pixel } = devices["Pixel 7"];
const report = {
  url,
  note: "Pixel 7 Chrome emulation using two same-origin tabs. This is not physical-device, real LINE, or authoritative-server evidence.",
  requirement: "Two tabs sharing one guest session must not create two BETs or deduct the same 5G twice when confirmation races.",
  startedAt: new Date().toISOString(),
  pageErrors: [],
};

function attachErrors(page, tab) {
  page.on("pageerror", error => report.pageErrors.push(tab + ": " + String(error)));
}

async function waitReady(page) {
  await page.waitForFunction(() =>
    typeof window.GH_V141 === "object" &&
    typeof window.GH_V166_REWARD_IDEMPOTENCY_LEDGER === "object" &&
    typeof state !== "undefined" &&
    document.querySelectorAll("button.horsePick").length === 7
  , null, { timeout: 20_000 });
}

function readState(page) {
  return page.evaluate(() => ({
    gold: typeof state !== "undefined" ? Number(state.gold) : null,
    activeBets: typeof state !== "undefined" && Array.isArray(state.raceBets) ? state.raceBets.length : null,
    betHistory: typeof state !== "undefined" && Array.isArray(state.betHistory) ? state.betHistory.length : null,
    bets: typeof state !== "undefined" && Array.isArray(state.raceBets)
      ? state.raceBets.map(bet => ({
          id: bet.id ?? bet.betId ?? bet.bet_id ?? null,
          type: bet.type ?? bet.betType ?? bet.ticketType ?? null,
          horse: bet.horse ?? bet.horseId ?? bet.horseNo ?? bet.selection ?? null,
          stake: Number(bet.stake ?? bet.amount ?? bet.betAmount ?? 0),
          odds: Number(bet.odds ?? 0),
        }))
      : [],
    countdown: (document.getElementById("countdown")?.textContent || "").trim(),
  }));
}

async function prepareFiveGoldBet(page) {
  await page.locator("button.horsePick").first().click();
  await page.getByRole("button", { name: "5G", exact: true }).first().click();
  await page.waitForFunction(() => {
    const button = document.getElementById("betBtn");
    return !!button && !button.disabled && !button.classList.contains("gh-v141-notready");
  });
  await page.locator("#betBtn").click();
  await page.locator("#gh-v141-ok").waitFor({ state: "visible", timeout: 5_000 });
  await page.waitForTimeout(700);
}

async function finishRace(page) {
  const skip = page.locator("#skipBtn");
  if (!await skip.isVisible().catch(() => false)) {
    await page.locator('button.gh-v60-nav-item[data-page="startPage"]').click();
    await skip.waitFor({ state: "visible", timeout: 5_000 });
  }
  await skip.click();
  await page.waitForFunction(() => document.getElementById("raceScreen")?.classList.contains("on"), null, { timeout: 25_000 });
  const runners = await page.locator("#runners .runner").count();
  if (runners !== 7) throw new Error("runner count=" + runners);

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
  return { runners, resultType: resultText.split("\n").slice(0, 2).join(" / ") };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext(pixel);
const pageA = await context.newPage();
pageA.setDefaultTimeout(12_000);
attachErrors(pageA, "tabA");

let pageB;
let exitCode = 0;
try {
  const response = await pageA.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  if (response?.status() !== 200) throw new Error("HTTP " + (response?.status() ?? "none"));
  await waitReady(pageA);

  report.initialA = await readState(pageA);
  if (report.initialA.gold !== 1000 || report.initialA.activeBets !== 0) {
    throw new Error("invalid initial tabA " + JSON.stringify(report.initialA));
  }

  const pagePromise = context.waitForEvent("page");
  await pageA.evaluate(() => {
    window.open(location.href, "_blank");
  });
  pageB = await pagePromise;
  pageB.setDefaultTimeout(12_000);
  attachErrors(pageB, "tabB");
  await pageB.waitForURL(target => target.href === url, { timeout: 30_000 });
  await waitReady(pageB);

  report.initialB = await readState(pageB);
  if (report.initialB.gold !== 1000 || report.initialB.activeBets !== 0) {
    throw new Error("invalid initial tabB " + JSON.stringify(report.initialB));
  }

  await Promise.all([prepareFiveGoldBet(pageA), prepareFiveGoldBet(pageB)]);
  report.confirmPreparedAt = new Date().toISOString();
  await Promise.all([
    pageA.locator("#gh-v141-ok").click(),
    pageB.locator("#gh-v141-ok").click(),
  ]);
  await Promise.all([
    pageA.waitForFunction(() => typeof state !== "undefined" && Array.isArray(state.raceBets) && state.raceBets.length >= 1, null, { timeout: 8_000 }),
    pageB.waitForFunction(() => typeof state !== "undefined" && Array.isArray(state.raceBets) && state.raceBets.length >= 1, null, { timeout: 8_000 }),
  ]);
  await pageA.waitForTimeout(800);
  report.afterConcurrentConfirmA = await readState(pageA);
  report.afterConcurrentConfirmB = await readState(pageB);

  await Promise.all([
    pageA.reload({ waitUntil: "domcontentloaded", timeout: 30_000 }),
    pageB.reload({ waitUntil: "domcontentloaded", timeout: 30_000 }),
  ]);
  await Promise.all([waitReady(pageA), waitReady(pageB)]);
  report.afterReloadA = await readState(pageA);
  report.afterReloadB = await readState(pageB);

  const sameCanonicalBet = JSON.stringify(report.afterReloadA.bets) === JSON.stringify(report.afterReloadB.bets);
  report.failClosedAfterReload =
    report.afterReloadA.gold === 995 &&
    report.afterReloadB.gold === 995 &&
    report.afterReloadA.activeBets === 1 &&
    report.afterReloadB.activeBets === 1 &&
    sameCanonicalBet;

  if (!report.failClosedAfterReload) {
    throw new Error("TWO_TAB_DUPLICATE_ACCEPTED " + JSON.stringify({
      tabA: report.afterReloadA,
      tabB: report.afterReloadB,
      sameCanonicalBet,
    }));
  }
  await pageA.screenshot({ path: "two-tab-concurrent-bet-after-reload.png", fullPage: false });

  report.race = await finishRace(pageA);
  report.afterResultA = await readState(pageA);
  await pageB.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
  await waitReady(pageB);
  report.afterResultB = await readState(pageB);

  if (
    report.afterResultA.activeBets !== 0 ||
    report.afterResultB.activeBets !== 0 ||
    report.afterResultA.betHistory !== 1 ||
    report.afterResultB.betHistory !== 1 ||
    report.afterResultA.gold !== report.afterResultB.gold
  ) {
    throw new Error("TWO_TAB_SETTLEMENT_DIVERGED " + JSON.stringify({
      tabA: report.afterResultA,
      tabB: report.afterResultB,
    }));
  }
  if (!["120", "119"].includes(report.afterResultA.countdown)) {
    throw new Error("next countdown=" + report.afterResultA.countdown);
  }
  if (report.pageErrors.length) throw new Error("page errors: " + report.pageErrors.join(" | "));

  report.pass = true;
  console.log("TWO_TAB_CONCURRENT_BET_QA=PASS " + JSON.stringify({
    goldAfterConfirm: report.afterReloadA.gold,
    activeBetsAfterConfirm: report.afterReloadA.activeBets,
    settledGold: report.afterResultA.gold,
    activeBetsAfterResult: report.afterResultA.activeBets,
    betHistory: report.afterResultA.betHistory,
    runners: report.race.runners,
  }));
  await pageA.screenshot({ path: "two-tab-concurrent-bet-pass.png", fullPage: false });
} catch (error) {
  exitCode = 1;
  report.pass = false;
  report.error = String(error);
  console.error("TWO_TAB_CONCURRENT_BET_QA=FAIL " + String(error));
  await pageA.screenshot({ path: "two-tab-concurrent-bet-failure-a.png", fullPage: false }).catch(() => {});
  if (pageB) await pageB.screenshot({ path: "two-tab-concurrent-bet-failure-b.png", fullPage: false }).catch(() => {});
} finally {
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync("two-tab-concurrent-bet-qa-report.json", JSON.stringify(report, null, 2));
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}

process.exit(exitCode);
