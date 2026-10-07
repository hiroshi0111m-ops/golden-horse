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

const pageErrors = [];
page.on("pageerror", err => pageErrors.push(String(err)));

const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
if (!response || !response.ok()) {
  throw new Error(`HTTP load failed: ${response ? response.status() : "no response"}`);
}

await page.waitForTimeout(2500);

const body = (await page.locator("body").innerText()).toUpperCase();

const checks = {
  body_nonempty: body.trim().length > 0,
  guest_visible: body.includes("GUEST") || body.includes("ゲスト"),
  bet_present: body.includes("BET"),
};

for (const [name, ok] of Object.entries(checks)) {
  console.log(`${name}=${ok ? "PASS" : "FAIL"}`);
}

if (pageErrors.length) {
  console.error("PAGE_ERRORS:");
  for (const e of pageErrors) console.error(e);
}

await page.screenshot({ path: "runtime-smoke.png", fullPage: true });
await browser.close();

if (Object.values(checks).some(v => !v) || pageErrors.length) {
  process.exit(1);
}

console.log(`RUNTIME_SMOKE=PASS url=${url}`);
