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

function fingerprintStorage(page) {
  return page.evaluate(() => {
    function summarize(storage) {
      const output = [];
      const interestingKey = /guest|fusion|race|bet|snapshot|ledger|state|safe|history/i;
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key === null) continue;
        const raw = storage.getItem(key);
        if (raw === null) continue;
        const states = [];
        let parsedKind = "non-json";
        let topLevelKeys = [];
        let hash = 2166136261;
        for (let offset = 0; offset < raw.length; offset += 1) {
          hash ^= raw.charCodeAt(offset);
          hash = Math.imul(hash, 16777619);
        }
        const fnv1a = (hash >>> 0).toString(16).padStart(8, "0");
        try {
          const root = JSON.parse(raw);
          parsedKind = Array.isArray(root) ? "array" : (root === null ? "null" : typeof root);
          if (root && typeof root === "object" && !Array.isArray(root)) {
            topLevelKeys = Object.keys(root).slice(0, 80);
          }
          const seen = new WeakSet();
          function walk(value, path, depth) {
            if (!value || typeof value !== "object" || depth > 8 || seen.has(value)) return;
            seen.add(value);
            const hasGold = Object.prototype.hasOwnProperty.call(value, "gold");
            const hasBets = Array.isArray(value.raceBets);
            const hasHistory = Array.isArray(value.betHistory);
            if (hasGold || hasBets || hasHistory) {
              const metadata = {};
              for (const [name, item] of Object.entries(value)) {
                if (/time|updated|version|revision|sequence|seq|race.?id|settled/i.test(name) &&
                    (typeof item === "string" || typeof item === "number" || typeof item === "boolean" || item === null)) {
                  metadata[name] = item;
                }
              }
              states.push({
                path,
                gold: hasGold ? Number(value.gold) : null,
                activeBets: hasBets ? value.raceBets.length : null,
                betHistory: hasHistory ? value.betHistory.length : null,
                metadata,
              });
            }
            if (Array.isArray(value)) {
              value.slice(0, 20).forEach((item, child) => walk(item, path + "[" + child + "]", depth + 1));
            } else {
              Object.entries(value).slice(0, 100).forEach(([name, item]) => walk(item, path + "." + name, depth + 1));
            }
          }
          walk(root, "$", 0);
        } catch {
          // Non-JSON entries are summarized by key and byte length only.
        }
        if (states.length || interestingKey.test(key)) {
          output.push({ key, bytes: raw.length, fnv1a, parsedKind, topLevelKeys, states });
        }
      }
      output.sort((a, b) => a.key.localeCompare(b.key));
      return output;
    }
    return {
      localStorage: summarize(localStorage),
      sessionStorage: summarize(sessionStorage),
    };
  });
}

function installStorageWriteTrace(page) {
  return page.addInitScript(() => {
    const writes = [];
    Object.defineProperty(window, "__ghStorageWrites", {
      value: writes,
      configurable: false,
      enumerable: false,
      writable: false,
    });
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function tracedSetItem(key, value) {
      const raw = String(value);
      const storageName = this === localStorage
        ? "localStorage"
        : (this === sessionStorage ? "sessionStorage" : "storage");
      if (/guest|fusion|race|bet|snapshot|ledger|state|safe|history/i.test(String(key)) && writes.length < 500) {
        function fnv1a(input) {
          let hash = 2166136261;
          if (input === null) return null;
          for (let index = 0; index < input.length; index += 1) {
            hash ^= input.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
          }
          return (hash >>> 0).toString(16).padStart(8, "0");
        }
        const before = this.getItem(key);
        writes.push({
          sequence: writes.length + 1,
          storage: storageName,
          key: String(key),
          beforeFnv1a: fnv1a(before),
          afterFnv1a: fnv1a(raw),
          bytes: raw.length,
          stack: String(new Error().stack || "")
            .split("\n")
            .slice(2, 9)
            .map(line => line.replace(location.href, "<document>")),
        });
      }
      return originalSetItem.apply(this, arguments);
    };
  });
}

function compactFingerprints(snapshot) {
  const result = {};
  for (const [phase, tabs] of Object.entries(snapshot || {})) {
    result[phase] = {};
    for (const [tab, stores] of Object.entries(tabs || {})) {
      result[phase][tab] = {};
      for (const [store, entries] of Object.entries(stores || {})) {
        result[phase][tab][store] = entries
          .map(entry => ({
            key: entry.key,
            bytes: entry.bytes,
            fnv1a: entry.fnv1a,
            parsedKind: entry.parsedKind,
            topLevelKeys: entry.topLevelKeys,
            states: entry.states,
          }));
      }
    }
  }
  return result;
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
  report.storage = {
    afterConcurrentConfirm: {
      tabA: await fingerprintStorage(pageA),
      tabB: await fingerprintStorage(pageB),
    },
  };

  await Promise.all([
    pageA.reload({ waitUntil: "domcontentloaded", timeout: 30_000 }),
    pageB.reload({ waitUntil: "domcontentloaded", timeout: 30_000 }),
  ]);
  await Promise.all([waitReady(pageA), waitReady(pageB)]);
  report.afterReloadA = await readState(pageA);
  report.afterReloadB = await readState(pageB);
  report.storage.afterConcurrentReload = {
    tabA: await fingerprintStorage(pageA),
    tabB: await fingerprintStorage(pageB),
  };

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
  report.storage.beforeTabBSettledReload = {
    tabA: await fingerprintStorage(pageA),
    tabB: await fingerprintStorage(pageB),
  };
  await installStorageWriteTrace(pageB);
  await pageB.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
  await waitReady(pageB);
  await pageB.waitForTimeout(500);
  report.afterResultB = await readState(pageB);
  report.storageWritesAfterTabBReload = await pageB.evaluate(() => window.__ghStorageWrites || []);
  console.log("TWO_TAB_STORAGE_WRITES=" + JSON.stringify(report.storageWritesAfterTabBReload));
  report.storage.afterTabBSettledReload = {
    tabA: await fingerprintStorage(pageA),
    tabB: await fingerprintStorage(pageB),
  };
  report.storageDiagnosis = compactFingerprints(report.storage);
  console.log("TWO_TAB_STORAGE_DIAG=" + JSON.stringify(report.storageDiagnosis));

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
  if (report.storage) {
    report.storageDiagnosis = compactFingerprints(report.storage);
    console.error("TWO_TAB_STORAGE_DIAG=" + JSON.stringify(report.storageDiagnosis));
  }
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
