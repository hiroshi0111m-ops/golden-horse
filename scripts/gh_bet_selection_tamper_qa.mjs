import { chromium, devices } from "playwright";
import fs from "fs";

const url = process.env.GH_TEST_URL;
if (!url) throw new Error("GH_TEST_URL is required");

const { defaultBrowserType: _defaultBrowserType, ...pixel } = devices["Pixel 7"];
const report = {
  url,
  note: "Android Chrome emulation against isolated V174. This is client-storage QA, not physical-device or authoritative-server evidence.",
  requirement: "The selected horse of an accepted active BET must not be replaceable by editing persisted client state.",
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
    slip: (document.getElementById("betSlips")?.textContent || "").trim(),
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

async function tamperPersistedSelection(page, expectedHorse) {
  return page.evaluate(originalHorse => {
    const mutations = [];

    function patch(value, path = "$") {
      if (Array.isArray(value)) {
        value.forEach((item, index) => patch(item, path + "[" + index + "]"));
        return;
      }
      if (!value || typeof value !== "object") return;

      const accepted =
        Object.prototype.hasOwnProperty.call(value, "gold") &&
        Array.isArray(value.raceBets) &&
        value.raceBets.length === 1 &&
        Number(value.gold) === 995;
      if (accepted) {
        const bet = value.raceBets[0];
        if (!bet || !Array.isArray(bet.horses) || bet.horses.length < 1) return;
        const current = Number(bet.horses[0]);
        if (current !== Number(originalHorse)) return;
        const forged = current === 7 ? 1 : 7;
        mutations.push({
          path: path + ".raceBets[0].horses[0]",
          before: bet.horses[0],
          forged: typeof bet.horses[0] === "string" ? String(forged) : forged,
        });
        bet.horses[0] = typeof bet.horses[0] === "string" ? String(forged) : forged;
        return;
      }

      for (const [key, child] of Object.entries(value)) patch(child, path + "." + key);
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
              mutations[i].storageKey = key;
            }
          }
        } catch {
          // Non-JSON entries are not candidate state containers.
        }
      }
    }
    return mutations;
  }, expectedHorse);
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

  await placeFiveGoldBet(page);
  report.accepted = await readState(page);
  if (
    report.accepted.gold !== 995 ||
    report.accepted.activeBets !== 1 ||
    !report.accepted.bet ||
    !Array.isArray(report.accepted.bet.horses) ||
    report.accepted.bet.horses.length !== 1
  ) {
    throw new Error("invalid accepted state " + JSON.stringify(report.accepted));
  }
  const trustedHorse = report.accepted.bet.horses[0];

  report.mutations = await tamperPersistedSelection(page, trustedHorse);
  if (!report.mutations.length) {
    throw new Error("NO_PERSISTED_ACTIVE_BET_SELECTION_FOUND");
  }
  await page.screenshot({ path: "bet-selection-tamper-before-reload.png", fullPage: false });

  await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
  await waitReady(page);
  report.afterTamperReload = await readState(page);

  const afterHorse = report.afterTamperReload.bet?.horses?.[0];
  const forgedHorse = report.mutations[0].forged;
  report.failClosed =
    report.afterTamperReload.gold === 995 &&
    report.afterTamperReload.activeBets === 1 &&
    JSON.stringify(afterHorse) === JSON.stringify(trustedHorse) &&
    JSON.stringify(afterHorse) !== JSON.stringify(forgedHorse);

  if (!report.failClosed) {
    throw new Error("BET_SELECTION_TAMPER_ACCEPTED " + JSON.stringify({
      trustedHorse,
      forgedHorse,
      afterHorse,
      state: report.afterTamperReload,
    }));
  }
  if (report.pageErrors.length) throw new Error("page errors: " + report.pageErrors.join(" | "));

  report.pass = true;
  console.log("BET_SELECTION_TAMPER_QA=PASS " + JSON.stringify({
    gold: report.afterTamperReload.gold,
    activeBets: report.afterTamperReload.activeBets,
    trustedHorse,
    forgedHorse,
    afterHorse,
    storage: report.mutations[0].storage,
    storageKey: report.mutations[0].storageKey,
  }));
  await page.screenshot({ path: "bet-selection-tamper-pass.png", fullPage: false });
} catch (error) {
  exitCode = 1;
  report.pass = false;
  report.error = String(error);
  console.error("BET_SELECTION_TAMPER_QA=FAIL " + String(error));
  await page.screenshot({ path: "bet-selection-tamper-failure.png", fullPage: false }).catch(() => {});
} finally {
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync("bet-selection-tamper-qa-report.json", JSON.stringify(report, null, 2));
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}

process.exit(exitCode);
