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
const url = `http://127.0.0.1:4173/${rel}`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.setDefaultTimeout(10000);

const pageErrors = [];
page.on("pageerror", err => pageErrors.push(String(err)));

let response;
try {
  response = await page.goto(url, { waitUntil: "commit", timeout: 30000 });
} catch (err) {
  console.error(`NAVIGATION_FAIL=${String(err)}`);
  await browser.close();
  process.exit(1);
}

if (!response || !response.ok()) {
  console.error(`HTTP_FAIL=${response ? response.status() : "no response"}`);
  await browser.close();
  process.exit(1);
}

await page.waitForTimeout(7000);

let body = "";
try {
  body = (await page.locator("body").innerText({ timeout: 10000 })).toUpperCase();
} catch (err) {
  console.error(`BODY_READ_FAIL=${String(err)}`);
  console.error("RUNTIME_SMOKE=NOT_RESPONSIVE");
  await browser.close().catch(() => {});
  process.exit(1);
}

const checks = {
  body_nonempty: body.trim().length > 0,
  guest_present: body.includes("GUEST") || body.includes("ゲスト"),
  bet_present: body.includes("BET"),
  result_present: body.includes("RESULT"),
};

let failed = false;
for (const [name, ok] of Object.entries(checks)) {
  console.log(`${name}=${ok ? "PASS" : "FAIL"}`);
  if (!ok) failed = true;
}

if (pageErrors.length) {
  console.error(`PAGE_ERRORS=${pageErrors.length}`);
  for (const e of pageErrors.slice(0, 20)) console.error(e);
  failed = true;
}

try {
  await page.screenshot({ path: "runtime-smoke-android-local.png", fullPage: false, timeout: 5000 });
} catch (err) {
  console.error(`SCREENSHOT_FAIL=${String(err)}`);
}

await browser.close().catch(() => {});

if (failed) process.exit(1);
console.log("RUNTIME_SMOKE=PASS");
