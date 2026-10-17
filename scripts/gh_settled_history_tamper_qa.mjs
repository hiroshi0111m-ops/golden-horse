import { chromium, devices } from "playwright";
import fs from "fs";

const url = process.env.GH_TEST_URL;
if (!url) throw new Error("GH_TEST_URL is required");

const { defaultBrowserType: _defaultBrowserType, ...pixel } = devices["Pixel 7"];
const report = {
  url,
  note: "Android Chrome emulation against isolated V174. This is not physical-device or production-server evidence.",
  requirement: "A settled BET history entry and its final Gold must not be deletable/refundable by editing client storage.",
  startedAt: new Date().toISOString(),
  pageErrors: [],
};

function readState(page) {
  return page.evaluate(() => ({
    gold: typeof state !== "undefined" ? Number(state.gold) : null,
    activeBets: typeof state !== "undefined" && Array.isArray(state.raceBets) ? state.raceBets.length : null,
    betHistory: typeof state !== "undefined" && Array.isArray(state.betHistory) ? state.betHistory.length : 0,
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

async function finishRaceAndArchive(page) {
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

async function tamperSettledHistoryAndRefund(page, expectedGold) {
  return page.evaluate((settledGold) => {
    const mutations = [];

    function patch(value, path = "$") {
      if (Array.isArray(value)) {
        value.forEach((item, index) => patch(item, `${path}[${index}]`));
        return;
      }
      if (!value || typeof value !== "object") return;

      const matchesSettledState =
        Object.prototype.hasOwnProperty.call(value, "gold") &&
        Array.isArray(value.raceBets) &&
        value.raceBets.length === 0 &&
        Array.isArray(value.betHistory) &&
        value.betHistory.length === 1 &&
        Number(value.gold) === settledGold;

      if (matchesSettledState) {
        const forgedGold = settledGold + 5;
        mutations.push({
          path,
          beforeGold: value.gold,
          afterGold: typeof value.gold === "string" ? String(forgedGold) : forgedGold,
          beforeHistory: value.betHistory.length,
          afterHistory: 0,
        });
        value.gold = typeof value.gold === "string" ? String(forgedGold) : forgedGold;
        value.betHistory = [];
        return;
      }

      for (const [key, child] of Object.entries(value)) {
        patch(child, `${path}.${key}`);
      }
    }

    for (const [storageName, storage] of [["localStorage", localStorage], ["sessionStorage", sessionStorage]]) {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key === null) continue;
        const raw = storage.getItem(key);
        if (raw === null) continue;
        try {
          const parsed = JSON.parse(raw);
          const beforeCount = mutations.length;
          patch(parsed);
          if (mutations.length > beforeCount) {
            storage.setItem(key, JSON.stringify(parsed));
            for (let i = beforeCount; i < mutations.length; i += 1) {
              mutations[i].storage = storageName;
              mutations[i].key = key;
            }
          }
        } catch {
          // Non-JSON entries are not candidate state containers.
        }
      }
    }
    return mutations;
  }, expectedGold);
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
  if (report.accepted.gold !== 995 || report.accepted.activeBets !== 1) {
    throw new Error(`invalid accepted state ${JSON.stringify(report.accepted)}`);
  }

  report.race = await finishRaceAndArchive(page);
  report.settled = await readState(page);
  if (report.settled.activeBets !== 0 || report.settled.betHistory !== 1) {
    throw new Error(`invalid settled state ${JSON.stringify(report.settled)}`);
  }
  if (!["120", "119"].includes(report.settled.countdown)) {
    throw new Error(`next countdown=${report.settled.countdown}`);
  }

  report.mutations = await tamperSettledHistoryAndRefund(page, report.settled.gold);
  if (!report.mutations.length) {
    throw new Error("NO_PERSISTED_SETTLED_HISTORY_STATE_FOUND");
  }
  await page.screenshot({ path: "settled-history-tamper-before-reload.png", fullPage: false });

  await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
  await waitReady(page);
  report.afterTamperReload = await readState(page);

  report.failClosed =
    report.afterTamperReload.gold === report.settled.gold &&
    report.afterTamperReload.activeBets === 0 &&
    report.afterTamperReload.betHistory === 1;

  if (!report.failClosed) {
    throw new Error(
      `SETTLED_HISTORY_TAMPER_ACCEPTED expectedGold=${report.settled.gold} actual=${JSON.stringify(report.afterTamperReload)}`
    );
  }
  if (report.pageErrors.length) {
    throw new Error(`page errors: ${report.pageErrors.join(" | ")}`);
  }

  report.pass = true;
  console.log(`SETTLED_HISTORY_TAMPER_QA=PASS ${JSON.stringify({
    settled: report.settled,
    mutations: report.mutations,
    afterTamperReload: report.afterTamperReload,
  })}`);
  await page.screenshot({ path: "settled-history-tamper-pass.png", fullPage: false });
} catch (error) {
  exitCode = 1;
  report.pass = false;
  report.error = String(error);
  console.error(`SETTLED_HISTORY_TAMPER_QA=FAIL ${String(error)}`);
  await page.screenshot({ path: "settled-history-tamper-failure.png", fullPage: false }).catch(() => {});
} finally {
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync("settled-history-tamper-qa-report.json", JSON.stringify(report, null, 2));
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}

process.exit(exitCode);
