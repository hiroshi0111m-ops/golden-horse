import { chromium, webkit } from "playwright";
import fs from "fs";

const url = "http://127.0.0.1:4173/checkpoints/V166_REWARD_IDEMPOTENCY_LEDGER/index.html";

const clients = [
  {
    name: "android-chrome",
    engine: "chromium",
    viewport: { width: 390, height: 844 },
    userAgent: "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0 Mobile Safari/537.36",
  },
  {
    name: "line-android-simulated",
    engine: "chromium",
    viewport: { width: 390, height: 844 },
    userAgent: "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0 Mobile Safari/537.36 Line/14.0.0",
  },
  {
    name: "iphone-safari",
    engine: "webkit",
    viewport: { width: 390, height: 844 },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  },
];

const engines = {
  chromium: await chromium.launch({ headless: true }),
  webkit: await webkit.launch({ headless: true }),
};

const report = { url, note: "LINE profile is a representative user-agent simulation, not a real LINE app runtime.", clients: [] };
let failed = false;

for (const cfg of clients) {
  const browser = engines[cfg.engine];
  const context = await browser.newContext({
    viewport: cfg.viewport,
    userAgent: cfg.userAgent,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));

  const row = {
    name: cfg.name,
    engine: cfg.engine,
    http: null,
    responsive: false,
    guest: false,
    initial1000Marker: false,
    betMarker: false,
    resultMarker: false,
    pageErrors: errors,
  };

  try {
    const res = await page.goto(url, { waitUntil: "commit", timeout: 20000 });
    row.http = res ? res.status() : null;
    await page.waitForTimeout(5000);
    const body = (await page.locator("body").innerText({ timeout: 8000 })).toUpperCase();
    row.responsive = body.trim().length > 0;
    row.guest = body.includes("GUEST") || body.includes("ゲスト");
    row.initial1000Marker = body.includes("1,000") || body.includes("1000");
    row.betMarker = body.includes("BET");
    row.resultMarker = body.includes("RESULT");

    await page.screenshot({
      path: `client-matrix-${cfg.name}.png`,
      fullPage: false,
      timeout: 5000,
    });
  } catch (err) {
    row.error = String(err);
  }

  if (!(row.http === 200 && row.responsive && row.guest && row.initial1000Marker && row.betMarker && row.resultMarker)) {
    failed = true;
  }

  report.clients.push(row);
  console.log(JSON.stringify(row));
  await context.close().catch(() => {});
}

await Promise.all(Object.values(engines).map(b => b.close().catch(() => {})));
fs.writeFileSync("client-matrix-report.json", JSON.stringify(report, null, 2));

if (failed) process.exit(1);
console.log("CLIENT_MATRIX=PASS");
