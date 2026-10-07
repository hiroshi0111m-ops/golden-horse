import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === ".git" || name === "node_modules") continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (name === "index.html") out.push(full);
  }
  return out;
}

const candidates = walk(root).sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);
if (!candidates.length) throw new Error("index.html not found");

const active = candidates[0];
const rel = path.relative(root, active).split(path.sep).map(encodeURIComponent).join("/");
const localUrl = `http://127.0.0.1:4173/${rel}`;
const targets = [
  { name: "android-local", url: localUrl, viewport: { width: 390, height: 844 } },
  { name: "desktop-local", url: localUrl, viewport: { width: 1366, height: 768 } },
];

if (process.env.GH_LIVE_URL) {
  targets.push({
    name: "android-live",
    url: process.env.GH_LIVE_URL,
    viewport: { width: 390, height: 844 },
  });
}

const browser = await chromium.launch({ headless: true });
let failed = false;

for (const target of targets) {
  const page = await browser.newPage({ viewport: target.viewport });
  const pageErrors = [];
  page.on("pageerror", err => pageErrors.push(String(err)));

  let response = null;
  try {
    // The current GOLDEN HORSE page can keep the browser busy for a long time.
    // We only wait for the HTTP/navigation commit, then inspect the live DOM.
    response = await page.goto(target.url, { waitUntil: "commit", timeout: 30000 });
  } catch (err) {
    console.error(`${target.name}: NAVIGATION_FAIL=${String(err)}`);
    failed = true;
    await page.close();
    continue;
  }

  if (!response || !response.ok()) {
    console.error(`${target.name}: HTTP_FAIL=${response ? response.status() : "no response"}`);
    failed = true;
    await page.close();
    continue;
  }

  await page.waitForTimeout(7000);

  let body = "";
  try {
    body = (await page.locator("body").innerText({ timeout: 10000 })).toUpperCase();
  } catch (err) {
    console.error(`${target.name}: BODY_READ_FAIL=${String(err)}`);
    failed = true;
  }

  const checks = {
    body_nonempty: body.trim().length > 0,
    guest_present: body.includes("GUEST") || body.includes("ゲスト"),
    bet_present: body.includes("BET"),
    result_present: body.includes("RESULT"),
  };

  for (const [name, ok] of Object.entries(checks)) {
    console.log(`${target.name}:${name}=${ok ? "PASS" : "FAIL"}`);
    if (!ok) failed = true;
  }

  if (pageErrors.length) {
    console.error(`${target.name}:PAGE_ERRORS=${pageErrors.length}`);
    for (const e of pageErrors.slice(0, 20)) console.error(e);
    failed = true;
  }

  try {
    await page.screenshot({ path: `runtime-smoke-${target.name}.png`, fullPage: false });
  } catch (err) {
    console.error(`${target.name}: SCREENSHOT_FAIL=${String(err)}`);
  }

  await page.close();
}

await browser.close();

if (failed) process.exit(1);
console.log("RUNTIME_SMOKE=PASS");
