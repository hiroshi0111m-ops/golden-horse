import { chromium, devices } from "playwright";
import fs from "fs";

const url = process.env.GH_TEST_URL;
if (!url) throw new Error("GH_TEST_URL is required");

const { defaultBrowserType: _defaultBrowserType, ...pixel } = devices["Pixel 7"];
const report = {
  url,
  note: "Android Chrome emulation only; this is not physical-device or real LINE evidence.",
  startedAt: new Date().toISOString(),
  confirmAttempt: null,
  afterConfirm: null,
  afterResult: null,
  pageErrors: [],
};

function readState(page) {
  return page.evaluate(() => ({
    gold: typeof state !== "undefined" ? Number(state.gold) : null,
    activeBets: typeof state !== "undefined" && Array.isArray(state.raceBets) ? state.raceBets.length : null,
    betHistory: typeof state !== "undefined" && Array.isArray(state.betHistory) ? state.betHistory.length : null,
    settled: typeof raceState !== "undefined" ? !!raceState.settled : null,
    countdown: (document.getElementById("countdown")?.textContent || "").trim(),
  }));
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext(pixel);
const page = await context.newPage();
page.setDefaultTimeout(10_000);
page.on("pageerror", error => report.pageErrors.push(String(error)));

let exitCode = 0;
try {
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  if (response?.status() !== 200) throw new Error(`HTTP ${response?.status() ?? "none"}`);
  await page.waitForFunction(() =>
    typeof window.GH_V141 === "object" &&
    typeof window.GH_V166_REWARD_IDEMPOTENCY_LEDGER === "object" &&
    document.querySelectorAll("button.horsePick").length === 7
  , null, { timeout: 20_000 });

  const initial = await readState(page);
  if (initial.gold !== 1000) throw new Error(`initial gold=${initial.gold}`);
  if (initial.activeBets !== 0) throw new Error(`initial active bets=${initial.activeBets}`);

  await page.locator("button.horsePick").first().click();
  await page.getByRole("button", { name: "5G", exact: true }).first().click();
  await page.waitForFunction(() => {
    const button = document.getElementById("betBtn");
    return !!button && !button.disabled && !button.classList.contains("gh-v141-notready");
  });
  await page.locator("#betBtn").click();
  await page.locator("#gh-v141-ok").waitFor({ state: "visible", timeout: 5_000 });
  await page.waitForTimeout(700);

  const confirm = page.locator("#gh-v141-ok");
  const box = await confirm.boundingBox();
  if (!box) throw new Error("confirm hit target missing");
  const point = {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
  await page.evaluate(() => {
    window.__ghDoubleSubmitEvents = [];
    document.addEventListener("click", event => {
      window.__ghDoubleSubmitEvents.push({
        targetId: event.target?.id || null,
        trusted: event.isTrusted,
        modalOn: !!document.getElementById("gh-v141-confirm")?.classList.contains("on"),
      });
    }, true);
  });
  await page.touchscreen.tap(point.x, point.y);
  await page.touchscreen.tap(point.x, point.y);
  await page.waitForTimeout(100);
  report.confirmAttempt = await page.evaluate(point => ({
    attemptedTaps: 2,
    point,
    events: window.__ghDoubleSubmitEvents || [],
    modalOnAfter: !!document.getElementById("gh-v141-confirm")?.classList.contains("on"),
  }), point);

  await page.waitForFunction(() =>
    typeof state !== "undefined" &&
    Array.isArray(state.raceBets) &&
    state.raceBets.length >= 1
  , null, { timeout: 8_000 });
  await page.waitForTimeout(300);
  report.afterConfirm = await readState(page);
  if (report.afterConfirm.gold !== 995) {
    throw new Error(`double-confirm gold mismatch: ${report.afterConfirm.gold}`);
  }
  if (report.afterConfirm.activeBets !== 1) {
    throw new Error(`double-confirm active bets=${report.afterConfirm.activeBets}`);
  }

  const skip = page.locator("#skipBtn");
  if (!await skip.isVisible()) {
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

  report.afterResult = await readState(page);
  report.runners = runners;
  report.resultType = resultText.split("\n").slice(0, 2).join(" / ");
  if (report.afterResult.activeBets !== 0) throw new Error(`active bets not archived: ${report.afterResult.activeBets}`);
  if (report.afterResult.betHistory !== 1) throw new Error(`duplicate history entries=${report.afterResult.betHistory}`);
  if (!["120", "119"].includes(report.afterResult.countdown)) {
    throw new Error(`next countdown=${report.afterResult.countdown}`);
  }
  if (report.pageErrors.length) throw new Error(`page errors: ${report.pageErrors.join(" | ")}`);

  report.pass = true;
  console.log(`DOUBLE_SUBMIT_QA=PASS ${JSON.stringify(report)}`);
  await page.screenshot({ path: "double-submit-qa-pass.png", fullPage: false });
} catch (error) {
  exitCode = 1;
  report.pass = false;
  report.error = String(error);
  console.error(`DOUBLE_SUBMIT_QA=FAIL ${String(error)}`);
  await page.screenshot({ path: "double-submit-qa-failure.png", fullPage: false }).catch(() => {});
} finally {
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync("double-submit-qa-report.json", JSON.stringify(report, null, 2));
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}

process.exit(exitCode);
