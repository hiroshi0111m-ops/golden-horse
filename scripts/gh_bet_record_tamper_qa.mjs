import { chromium, devices } from "playwright";
import fs from "fs";

const url = process.env.GH_TEST_URL;
if (!url) throw new Error("GH_TEST_URL is required");

const { defaultBrowserType: _defaultBrowserType, ...pixel } = devices["Pixel 7"];
const report = {
  url,
  note: "Android Chrome emulation against isolated V174. This is not physical-device or production-server evidence.",
  requirement: "A persisted accepted BET and its 5G debit must not be deletable/refundable by editing client storage.",
  startedAt: new Date().toISOString(),
  pageErrors: [],
};

function readState(page) {
  return page.evaluate(() => ({
    gold: typeof state !== "undefined" ? Number(state.gold) : null,
    activeBets: typeof state !== "undefined" && Array.isArray(state.raceBets) ? state.raceBets.length : null,
    betHistory: typeof state !== "undefined" && Array.isArray(state.betHistory) ? state.betHistory.length : 0,
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

async function tamperPersistedBetAndRefund(page) {
  return page.evaluate(() => {
    const mutations = [];

    function patch(value, path = "$") {
      if (Array.isArray(value)) {
        value.forEach((item, index) => patch(item, `${path}[${index}]`));
        return;
      }
      if (!value || typeof value !== "object") return;

      const hasGold = Object.prototype.hasOwnProperty.call(value, "gold");
      const hasRaceBets = Array.isArray(value.raceBets);
      if (hasGold && hasRaceBets && Number(value.gold) === 995 && value.raceBets.length === 1) {
        mutations.push({
          path,
          beforeGold: value.gold,
          afterGold: typeof value.gold === "string" ? "1000" : 1000,
          beforeActiveBets: value.raceBets.length,
          afterActiveBets: 0,
        });
        value.gold = typeof value.gold === "string" ? "1000" : 1000;
        value.raceBets = [];
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
  });
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
  if (report.initial.gold !== 1000 || report.initial.activeBets !== 0) {
    throw new Error(`invalid initial state ${JSON.stringify(report.initial)}`);
  }

  await placeFiveGoldBet(page);
  report.beforeTamper = await readState(page);
  if (report.beforeTamper.gold !== 995 || report.beforeTamper.activeBets !== 1) {
    throw new Error(`invalid accepted state ${JSON.stringify(report.beforeTamper)}`);
  }

  report.mutations = await tamperPersistedBetAndRefund(page);
  if (!report.mutations.length) {
    throw new Error("NO_PERSISTED_ACCEPTED_BET_STATE_FOUND");
  }
  await page.screenshot({ path: "bet-record-tamper-before-reload.png", fullPage: false });

  await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
  await waitReady(page);
  report.afterTamperReload = await readState(page);

  report.failClosed =
    report.afterTamperReload.gold === 995 &&
    report.afterTamperReload.activeBets === 1;

  if (!report.failClosed) {
    throw new Error(
      `BET_RECORD_TAMPER_ACCEPTED gold=${report.afterTamperReload.gold} activeBets=${report.afterTamperReload.activeBets}`
    );
  }
  if (report.pageErrors.length) {
    throw new Error(`page errors: ${report.pageErrors.join(" | ")}`);
  }

  report.pass = true;
  console.log(`BET_RECORD_TAMPER_QA=PASS ${JSON.stringify({ mutations: report.mutations, afterTamperReload: report.afterTamperReload })}`);
  await page.screenshot({ path: "bet-record-tamper-pass.png", fullPage: false });
} catch (error) {
  exitCode = 1;
  report.pass = false;
  report.error = String(error);
  console.error(`BET_RECORD_TAMPER_QA=FAIL ${String(error)}`);
  await page.screenshot({ path: "bet-record-tamper-failure.png", fullPage: false }).catch(() => {});
} finally {
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync("bet-record-tamper-qa-report.json", JSON.stringify(report, null, 2));
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}

process.exit(exitCode);
