import { chromium, devices } from "playwright";
import fs from "fs";

const url = process.env.GH_TEST_URL;
if (!url) throw new Error("GH_TEST_URL is required");

const { defaultBrowserType: _defaultBrowserType, ...pixel } = devices["Pixel 7"];
const report = {
  url,
  note: "Android Chrome emulation against isolated V174. This is client-storage replay QA, not physical-device or authoritative-server evidence.",
  requirement: "A valid settled snapshot must not erase/refund a later accepted BET when replayed.",
  startedAt: new Date().toISOString(),
  pageErrors: [],
};

function readState(page) {
  return page.evaluate(() => ({
    gold: typeof state !== "undefined" ? Number(state.gold) : null,
    activeBets: typeof state !== "undefined" && Array.isArray(state.raceBets) ? state.raceBets.length : null,
    betHistory: typeof state !== "undefined" && Array.isArray(state.betHistory) ? state.betHistory.length : 0,
    bet: typeof state !== "undefined" && Array.isArray(state.raceBets) && state.raceBets[0]
      ? JSON.parse(JSON.stringify(state.raceBets[0]))
      : null,
    countdown: (document.getElementById("countdown")?.textContent || "").trim(),
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

async function waitForPersistedState(page, gold, activeBets, betHistory) {
  await page.waitForFunction(({ expectedGold, expectedBets, expectedHistory }) => {
    function containsState(value) {
      if (Array.isArray(value)) return value.some(containsState);
      if (!value || typeof value !== "object") return false;
      if (
        Object.prototype.hasOwnProperty.call(value, "gold") &&
        Array.isArray(value.raceBets) &&
        Number(value.gold) === expectedGold &&
        value.raceBets.length === expectedBets &&
        (expectedHistory === null ||
          (Array.isArray(value.betHistory) && value.betHistory.length === expectedHistory))
      ) return true;
      return Object.values(value).some(containsState);
    }
    for (const storage of [localStorage, sessionStorage]) {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key === null) continue;
        const raw = storage.getItem(key);
        if (raw === null) continue;
        try {
          if (containsState(JSON.parse(raw))) return true;
        } catch {
          // Non-JSON entries are not candidate state containers.
        }
      }
    }
    return false;
  }, {
    expectedGold: gold,
    expectedBets: activeBets,
    expectedHistory: betHistory,
  }, { timeout: 8_000 });
}

function captureStorage(page) {
  return page.evaluate(() => {
    function snapshot(storage) {
      const entries = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key !== null) entries.push([key, storage.getItem(key)]);
      }
      entries.sort(([a], [b]) => a.localeCompare(b));
      return entries;
    }
    return {
      localStorage: snapshot(localStorage),
      sessionStorage: snapshot(sessionStorage),
    };
  });
}

function restoreStorage(page, snapshot) {
  return page.evaluate(saved => {
    function restore(storage, entries) {
      storage.clear();
      for (const [key, value] of entries) {
        if (value !== null) storage.setItem(key, value);
      }
    }
    restore(localStorage, saved.localStorage);
    restore(sessionStorage, saved.sessionStorage);
    return {
      localKeys: saved.localStorage.map(([key]) => key),
      sessionKeys: saved.sessionStorage.map(([key]) => key),
    };
  }, snapshot);
}

async function placeFiveGoldBet(page, expectedGold) {
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
  await confirm.click();
  await page.waitForFunction(value =>
    typeof state !== "undefined" &&
    Number(state.gold) === value &&
    Array.isArray(state.raceBets) &&
    state.raceBets.length === 1
  , expectedGold, { timeout: 12_000 });
}

async function finishRaceAndArchive(page) {
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
const page = await context.newPage();
page.setDefaultTimeout(12_000);
page.on("pageerror", error => report.pageErrors.push(String(error)));

let exitCode = 0;
try {
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  if (response?.status() !== 200) throw new Error("HTTP " + (response?.status() ?? "none"));
  await waitReady(page);

  report.initial = await readState(page);
  if (report.initial.gold !== 1000 || report.initial.activeBets !== 0 || report.initial.betHistory !== 0) {
    throw new Error("invalid initial state " + JSON.stringify(report.initial));
  }

  await placeFiveGoldBet(page, 995);
  report.firstAccepted = await readState(page);
  if (report.firstAccepted.gold !== 995 || report.firstAccepted.activeBets !== 1) {
    throw new Error("invalid first accepted state " + JSON.stringify(report.firstAccepted));
  }

  report.race = await finishRaceAndArchive(page);
  report.settled = await readState(page);
  if (report.settled.activeBets !== 0 || report.settled.betHistory !== 1) {
    throw new Error("invalid settled state " + JSON.stringify(report.settled));
  }
  if (!["120", "119"].includes(report.settled.countdown)) {
    throw new Error("next countdown=" + report.settled.countdown);
  }
  await waitForPersistedState(page, report.settled.gold, 0, 1);
  const settledSnapshot = await captureStorage(page);
  report.settledStorage = {
    localKeys: settledSnapshot.localStorage.map(([key]) => key),
    sessionKeys: settledSnapshot.sessionStorage.map(([key]) => key),
  };
  await page.screenshot({ path: "post-settlement-replay-settled.png", fullPage: false });

  const secondAcceptedGold = report.settled.gold - 5;
  await placeFiveGoldBet(page, secondAcceptedGold);
  await waitForPersistedState(page, secondAcceptedGold, 1, 1);
  report.secondAccepted = await readState(page);
  if (
    report.secondAccepted.gold !== secondAcceptedGold ||
    report.secondAccepted.activeBets !== 1 ||
    report.secondAccepted.betHistory !== 1 ||
    !report.secondAccepted.bet
  ) {
    throw new Error("invalid second accepted state " + JSON.stringify(report.secondAccepted));
  }
  await page.screenshot({ path: "post-settlement-replay-second-bet.png", fullPage: false });

  report.replayedStorage = await restoreStorage(page, settledSnapshot);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
  await waitReady(page);
  report.afterReplayReload = await readState(page);

  report.failClosed =
    report.afterReplayReload.gold === secondAcceptedGold &&
    report.afterReplayReload.activeBets === 1 &&
    report.afterReplayReload.betHistory === 1 &&
    JSON.stringify(report.afterReplayReload.bet) === JSON.stringify(report.secondAccepted.bet);

  if (!report.failClosed) {
    throw new Error("SETTLED_SNAPSHOT_ROLLBACK_ACCEPTED " + JSON.stringify({
      settledGold: report.settled.gold,
      secondAcceptedGold,
      replayedGold: report.afterReplayReload.gold,
      replayedActiveBets: report.afterReplayReload.activeBets,
      replayedHistory: report.afterReplayReload.betHistory,
    }));
  }
  if (report.pageErrors.length) throw new Error("page errors: " + report.pageErrors.join(" | "));

  report.pass = true;
  console.log("POST_SETTLEMENT_REPLAY_QA=PASS " + JSON.stringify({
    settledGold: report.settled.gold,
    secondAcceptedGold,
    gold: report.afterReplayReload.gold,
    activeBets: report.afterReplayReload.activeBets,
    betHistory: report.afterReplayReload.betHistory,
    runners: report.race.runners,
    localKeys: report.replayedStorage.localKeys,
    sessionKeys: report.replayedStorage.sessionKeys,
  }));
  await page.screenshot({ path: "post-settlement-replay-pass.png", fullPage: false });
} catch (error) {
  exitCode = 1;
  report.pass = false;
  report.error = String(error);
  console.error("POST_SETTLEMENT_REPLAY_QA=FAIL " + String(error));
  await page.screenshot({ path: "post-settlement-replay-failure.png", fullPage: false }).catch(() => {});
} finally {
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync("post-settlement-replay-qa-report.json", JSON.stringify(report, null, 2));
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}

process.exit(exitCode);
