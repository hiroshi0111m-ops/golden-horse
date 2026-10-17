import { chromium, devices } from "playwright";
import fs from "fs";

const url = process.env.GH_TEST_URL;
if (!url) throw new Error("GH_TEST_URL is required");

const { defaultBrowserType: _defaultBrowserType, ...pixel } = devices["Pixel 7"];
const report = {
  url,
  note: "Android Chrome emulation against isolated V174. This is client-storage replay QA, not physical-device or authoritative-server evidence.",
  requirement: "A previously valid pre-BET client-storage snapshot must not roll back an accepted 5G BET.",
  startedAt: new Date().toISOString(),
  pageErrors: [],
};

function readState(page) {
  return page.evaluate(() => ({
    gold: typeof state !== "undefined" ? Number(state.gold) : null,
    activeBets: typeof state !== "undefined" && Array.isArray(state.raceBets) ? state.raceBets.length : null,
    bet: typeof state !== "undefined" && Array.isArray(state.raceBets) && state.raceBets[0]
      ? JSON.parse(JSON.stringify(state.raceBets[0]))
      : null,
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

async function waitForPersistedState(page, gold, activeBets) {
  await page.waitForFunction(({ expectedGold, expectedBets }) => {
    function containsState(value) {
      if (Array.isArray(value)) return value.some(containsState);
      if (!value || typeof value !== "object") return false;
      if (
        Object.prototype.hasOwnProperty.call(value, "gold") &&
        Array.isArray(value.raceBets) &&
        Number(value.gold) === expectedGold &&
        value.raceBets.length === expectedBets
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
  }, { expectedGold: gold, expectedBets: activeBets }, { timeout: 8_000 });
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

async function placeFiveGoldBet(page) {
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
  await page.waitForFunction(() =>
    typeof state !== "undefined" &&
    Number(state.gold) === 995 &&
    Array.isArray(state.raceBets) &&
    state.raceBets.length === 1
  , null, { timeout: 12_000 });
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
  if (report.initial.gold !== 1000 || report.initial.activeBets !== 0) {
    throw new Error("invalid initial state " + JSON.stringify(report.initial));
  }

  await waitForPersistedState(page, 1000, 0);
  const preBetSnapshot = await captureStorage(page);
  report.preBetStorage = {
    localKeys: preBetSnapshot.localStorage.map(([key]) => key),
    sessionKeys: preBetSnapshot.sessionStorage.map(([key]) => key),
  };
  if (!preBetSnapshot.localStorage.length && !preBetSnapshot.sessionStorage.length) {
    throw new Error("NO_PRE_BET_PERSISTED_STATE");
  }

  await placeFiveGoldBet(page);
  await waitForPersistedState(page, 995, 1);
  report.accepted = await readState(page);
  if (report.accepted.gold !== 995 || report.accepted.activeBets !== 1 || !report.accepted.bet) {
    throw new Error("invalid accepted state " + JSON.stringify(report.accepted));
  }
  await page.screenshot({ path: "storage-replay-accepted-bet.png", fullPage: false });

  report.replayedStorage = await restoreStorage(page, preBetSnapshot);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
  await waitReady(page);
  report.afterReplayReload = await readState(page);

  report.failClosed =
    report.afterReplayReload.gold === 995 &&
    report.afterReplayReload.activeBets === 1 &&
    JSON.stringify(report.afterReplayReload.bet) === JSON.stringify(report.accepted.bet);

  if (!report.failClosed) {
    const detail = {
      acceptedGold: report.accepted.gold,
      acceptedBets: report.accepted.activeBets,
      replayedGold: report.afterReplayReload.gold,
      replayedBets: report.afterReplayReload.activeBets,
    };
    throw new Error("STALE_SIGNED_STATE_REPLAY_ACCEPTED " + JSON.stringify(detail));
  }
  if (report.pageErrors.length) throw new Error("page errors: " + report.pageErrors.join(" | "));

  report.pass = true;
  console.log("STORAGE_REPLAY_QA=PASS " + JSON.stringify({
    gold: report.afterReplayReload.gold,
    activeBets: report.afterReplayReload.activeBets,
    localKeys: report.replayedStorage.localKeys,
    sessionKeys: report.replayedStorage.sessionKeys,
  }));
  await page.screenshot({ path: "storage-replay-pass.png", fullPage: false });
} catch (error) {
  exitCode = 1;
  report.pass = false;
  report.error = String(error);
  console.error("STORAGE_REPLAY_QA=FAIL " + String(error));
  await page.screenshot({ path: "storage-replay-failure.png", fullPage: false }).catch(() => {});
} finally {
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync("storage-replay-qa-report.json", JSON.stringify(report, null, 2));
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}

process.exit(exitCode);
