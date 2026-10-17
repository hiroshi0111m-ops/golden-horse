import { chromium, devices } from "playwright";
import fs from "fs";

const url = process.env.GH_TEST_URL;
if (!url) throw new Error("GH_TEST_URL is required");

const { defaultBrowserType: _defaultBrowserType, ...pixel } = devices["Pixel 7"];
const report = {
  url,
  note: "Android Chrome emulation against isolated V174. This is client-storage QA, not physical-device or authoritative-server evidence.",
  requirement: "Payout-relevant fields of an accepted active BET must not be alterable by editing persisted client state.",
  startedAt: new Date().toISOString(),
  pageErrors: [],
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

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

function relevantField(key) {
  return /(^|_)(amount|amt|stake|wager|odds?|payout|payoff|return|reward|cost|total)(_|$)/i.test(key) &&
    !/(^|_)(id|index|count)(_|$)/i.test(key);
}

function forgedValue(key, value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  const multiplier = /odds?|payout|payoff|return|reward/i.test(key) ? 100 : 20;
  const forged = number === 0 ? 999 : number * multiplier;
  return typeof value === "string" ? String(forged) : forged;
}

async function tamperPersistedBetTerms(page) {
  return page.evaluate(({ relevantSource, forgedSource }) => {
    const relevant = new Function("key", "return (" + relevantSource + ")(key);");
    const forge = new Function("key", "value", "return (" + forgedSource + ")(key, value);");
    const mutations = [];

    function patchBet(value, tokens = []) {
      if (Array.isArray(value)) {
        value.forEach((item, index) => patchBet(item, tokens.concat(index)));
        return;
      }
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        if (relevant(key) && (typeof child === "number" || (typeof child === "string" && child.trim() !== "" && Number.isFinite(Number(child))))) {
          const after = forge(key, child);
          if (after !== child) {
            mutations.push({ tokens: tokens.concat(key), key, before: child, forged: after });
            value[key] = after;
          }
        } else {
          patchBet(child, tokens.concat(key));
        }
      }
    }

    function patchContainer(value, path = "$") {
      if (Array.isArray(value)) {
        value.forEach((item, index) => patchContainer(item, path + "[" + index + "]"));
        return;
      }
      if (!value || typeof value !== "object") return;
      const accepted =
        Object.prototype.hasOwnProperty.call(value, "gold") &&
        Array.isArray(value.raceBets) &&
        value.raceBets.length === 1 &&
        Number(value.gold) === 995;
      if (accepted) {
        const beforeCount = mutations.length;
        patchBet(value.raceBets[0]);
        for (let i = beforeCount; i < mutations.length; i += 1) mutations[i].containerPath = path;
        return;
      }
      for (const [key, child] of Object.entries(value)) patchContainer(child, path + "." + key);
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
          patchContainer(parsed);
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
  }, { relevantSource: relevantField.toString(), forgedSource: forgedValue.toString() });
}

function getAt(value, tokens) {
  let current = value;
  for (const token of tokens) {
    if (current === null || current === undefined) return undefined;
    current = current[token];
  }
  return current;
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
  if (report.accepted.gold !== 995 || report.accepted.activeBets !== 1 || !report.accepted.bet) {
    throw new Error("invalid accepted state " + JSON.stringify(report.accepted));
  }
  const trustedBet = clone(report.accepted.bet);

  report.mutations = await tamperPersistedBetTerms(page);
  if (!report.mutations.length) {
    throw new Error("NO_PAYOUT_RELEVANT_PERSISTED_BET_FIELD_FOUND schema=" + JSON.stringify(Object.keys(trustedBet)));
  }
  await page.screenshot({ path: "bet-terms-tamper-before-reload.png", fullPage: false });

  await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
  await waitReady(page);
  report.afterTamperReload = await readState(page);

  if (report.afterTamperReload.gold !== 995 || report.afterTamperReload.activeBets !== 1 || !report.afterTamperReload.bet) {
    throw new Error("BET_TERMS_TAMPER_CHANGED_ACCEPTED_STATE " + JSON.stringify(report.afterTamperReload));
  }

  report.comparisons = report.mutations.map(mutation => ({
    tokens: mutation.tokens,
    before: getAt(trustedBet, mutation.tokens),
    forged: mutation.forged,
    afterReload: getAt(report.afterTamperReload.bet, mutation.tokens),
  }));
  report.failClosed = report.comparisons.every(item =>
    JSON.stringify(item.afterReload) === JSON.stringify(item.before) &&
    JSON.stringify(item.afterReload) !== JSON.stringify(item.forged)
  );

  if (!report.failClosed) {
    throw new Error("BET_TERMS_TAMPER_ACCEPTED " + JSON.stringify(report.comparisons));
  }
  if (report.pageErrors.length) throw new Error("page errors: " + report.pageErrors.join(" | "));

  report.pass = true;
  console.log("BET_TERMS_TAMPER_QA=PASS " + JSON.stringify({
    gold: report.afterTamperReload.gold,
    activeBets: report.afterTamperReload.activeBets,
    mutations: report.mutations.map(({ tokens, key, before, forged, storage, storageKey }) => ({
      tokens, key, before, forged, storage, storageKey,
    })),
    comparisons: report.comparisons,
  }));
  await page.screenshot({ path: "bet-terms-tamper-pass.png", fullPage: false });
} catch (error) {
  exitCode = 1;
  report.pass = false;
  report.error = String(error);
  console.error("BET_TERMS_TAMPER_QA=FAIL " + String(error));
  await page.screenshot({ path: "bet-terms-tamper-failure.png", fullPage: false }).catch(() => {});
} finally {
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync("bet-terms-tamper-qa-report.json", JSON.stringify(report, null, 2));
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}

process.exit(exitCode);
