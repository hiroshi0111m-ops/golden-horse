import { chromium, webkit, devices } from "playwright";
import fs from "fs";

const url = "http://127.0.0.1:4173/checkpoints/V171_THREE_CYCLE_FIX/index.html";

function deviceOptions(name) {
  const { defaultBrowserType: _defaultBrowserType, ...options } = devices[name];
  return options;
}

const pixel = deviceOptions("Pixel 7");
const iphone = deviceOptions("iPhone 15");
const clients = [
  { name: "android-chrome", engine: "chromium", contextOptions: pixel },
  {
    name: "line-android-simulated",
    engine: "chromium",
    contextOptions: { ...pixel, userAgent: `${pixel.userAgent} Line/14.0.0` },
  },
  { name: "iphone-safari", engine: "webkit", contextOptions: iphone },
];

async function state(page) {
  return page.evaluate(() => ({
    gold: typeof state !== "undefined" ? Number(state.gold) : null,
    todayRaces: typeof state !== "undefined" ? Number(state.todayRaces) : null,
    activeBets: typeof state !== "undefined" && Array.isArray(state.raceBets) ? state.raceBets.length : null,
    betHistory: typeof state !== "undefined" && Array.isArray(state.betHistory) ? state.betHistory.length : 0,
    settled: typeof raceState !== "undefined" ? !!raceState.settled : null,
    countdown: (document.getElementById("countdown")?.textContent || "").trim(),
  }));
}

async function placeFiveGoldBet(page, row) {
  await page.locator("button.horsePick").first().click();
  await page.getByRole("button", { name: "5G", exact: true }).first().click();
  await page.waitForFunction(() => {
    const button = document.getElementById("betBtn");
    return !!button && !button.disabled && !button.classList.contains("gh-v141-notready");
  }, null, { timeout: 12_000 });
  await page.evaluate(() => {
    window.__ghClientBetTrace = [];
    window.addEventListener("click", event => {
      const button = event.target?.closest?.("#betBtn");
      if (!button) return;
      const entry = {
        trusted: event.isTrusted,
        detail: event.detail,
        defaultBefore: event.defaultPrevented,
        busyBefore: button.dataset.ghBusy || "",
        blockedBefore: Number(window.GH_V54_TAP_GUARD?.blocked || 0),
      };
      window.__ghClientBetTrace.push(entry);
      queueMicrotask(() => Object.assign(entry, {
        defaultAfter: event.defaultPrevented,
        busyAfter: button.dataset.ghBusy || "",
        blockedAfter: Number(window.GH_V54_TAP_GUARD?.blocked || 0),
        modalOn: !!document.getElementById("gh-v141-confirm")?.classList.contains("on"),
        selections: typeof betSelections !== "undefined" ? [...betSelections] : null,
        stake: typeof stake !== "undefined" ? Number(stake) : null,
        mode: typeof currentMode === "function" ? currentMode() : null,
      }));
    }, true);
  });
  const betButton = page.locator("#betBtn");
  await betButton.scrollIntoViewIfNeeded();
  row.betHitTarget = await betButton.evaluate(button => {
    const rect = button.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    return {
      x: Math.round(x),
      y: Math.round(y),
      tag: hit?.tagName || null,
      id: hit?.id || null,
      className: typeof hit?.className === "string" ? hit.className : null,
      isBetButton: hit === button || !!hit?.closest?.("#betBtn"),
    };
  });
  await betButton.click({ timeout: 10_000 });
  await page.waitForTimeout(50);
  row.betTrace = await page.evaluate(() => window.__ghClientBetTrace || []);
  const confirm = page.locator("#gh-v141-ok");
  await confirm.waitFor({ state: "visible", timeout: 5_000 });
  await page.waitForTimeout(700);
  await confirm.click();
  await page.waitForFunction(() => {
    const text = (document.getElementById("betSlips")?.textContent || "").trim();
    return text.length > 0 && !text.includes("まだ投票はありません");
  }, null, { timeout: 8_000 });
  return (await page.locator("#betSlips").innerText()).trim().slice(0, 300);
}

async function runClient(browser, cfg) {
  const context = await browser.newContext(cfg.contextOptions);
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", error => pageErrors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });

  const row = {
    name: cfg.name,
    engine: cfg.engine,
    http: null,
    initialGold: null,
    betAmount: 5,
    goldAfterBet: null,
    runnerCount: null,
    resultType: null,
    goldAfterResult: null,
    betHistory: null,
    nextCountdown: null,
    transitionMode: null,
    appReady: null,
    pageErrors,
    consoleErrors,
  };

  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    row.http = response?.status() ?? null;
    if (row.http !== 200) throw new Error(`HTTP ${row.http}`);
    await page.waitForFunction(() => {
      const ready = document.readyState === "interactive" || document.readyState === "complete";
      const finalGuard = typeof window.GH_V166_REWARD_IDEMPOTENCY_LEDGER === "object";
      const betGuard = typeof window.GH_V141 === "object";
      return ready && finalGuard && betGuard && document.querySelectorAll("button.horsePick").length === 7;
    }, null, { timeout: 20_000 });
    row.appReady = await page.evaluate(() => ({
      readyState: document.readyState,
      betGuard: !!window.GH_V141,
      finalGuard: !!window.GH_V166_REWARD_IDEMPOTENCY_LEDGER,
      horseChoices: document.querySelectorAll("button.horsePick").length,
    }));

    const body = await page.locator("body").innerText();
    if (!/体験モード|GUEST|ゲスト/i.test(body)) throw new Error("guest marker missing");
    const before = await state(page);
    row.initialGold = before.gold;
    if (before.gold !== 1000) throw new Error(`initial gold=${before.gold}`);

    row.slips = await placeFiveGoldBet(page, row);
    const afterBet = await state(page);
    row.goldAfterBet = afterBet.gold;
    if (afterBet.gold !== 995) throw new Error(`5G deduction mismatch: ${afterBet.gold}`);
    if (afterBet.activeBets !== 1) throw new Error(`active bets=${afterBet.activeBets}`);

    await page.locator("#skipBtn").click();
    await page.waitForFunction(() => document.getElementById("raceScreen")?.classList.contains("on"), null, { timeout: 25_000 });
    row.runnerCount = await page.locator("#runners .runner").count();
    if (row.runnerCount !== 7) throw new Error(`runner count=${row.runnerCount}`);

    await page.waitForFunction(() => {
      const overlay = document.getElementById("finishOverlay");
      const panel = document.getElementById("finishPanel");
      return !!overlay?.classList.contains("on") && !panel?.classList.contains("hidden") &&
        typeof raceState !== "undefined" && raceState.settled;
    }, null, { timeout: 110_000 });
    const resultText = (await page.locator("#finishPanel").innerText()).trim();
    if (!/OFFICIAL|RESULT|確定/i.test(resultText)) throw new Error("official result missing");
    row.resultType = resultText.split("\n").slice(0, 2).join(" / ");

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

    const after = await state(page);
    row.goldAfterResult = after.gold;
    row.betHistory = after.betHistory;
    row.nextCountdown = after.countdown;
    if (after.activeBets !== 0) throw new Error(`active bets not archived: ${after.activeBets}`);
    if (after.betHistory !== 1) throw new Error(`bet history=${after.betHistory}`);
    if (after.countdown !== "120" && after.countdown !== "119") throw new Error(`next countdown=${after.countdown}`);
    if (pageErrors.length) throw new Error(`page errors: ${pageErrors.join(" | ")}`);

    row.pass = true;
    await page.screenshot({ path: `client-matrix-${cfg.name}.png`, fullPage: false, timeout: 5_000 });
    console.log(`CLIENT_${cfg.name}=PASS ${JSON.stringify(row)}`);
  } catch (error) {
    row.pass = false;
    row.error = String(error);
    await page.screenshot({ path: `client-matrix-${cfg.name}-failure.png`, fullPage: false, timeout: 5_000 }).catch(() => {});
    console.error(`CLIENT_${cfg.name}=FAIL ${String(error)}`);
  } finally {
    await context.close().catch(() => {});
  }
  return row;
}

const engines = {
  chromium: await chromium.launch({ headless: true }),
  webkit: await webkit.launch({ headless: true }),
};
const report = {
  url,
  note: "Emulation only. LINE uses a representative user agent; none of these results count as physical-device or real LINE in-app-browser PASS.",
  startedAt: new Date().toISOString(),
  clients: [],
};

for (const cfg of clients) report.clients.push(await runClient(engines[cfg.engine], cfg));
await Promise.all(Object.values(engines).map(browser => browser.close().catch(() => {})));
report.finishedAt = new Date().toISOString();
fs.writeFileSync("client-matrix-report.json", JSON.stringify(report, null, 2));

if (report.clients.some(client => !client.pass)) process.exit(1);
console.log("CLIENT_MATRIX=PASS");
