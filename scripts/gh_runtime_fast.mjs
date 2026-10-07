import { chromium } from "playwright-core";
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

const candidates = walk(root).sort((a,b)=>fs.statSync(b).size-fs.statSync(a).size);
if (!candidates.length) throw new Error("index.html not found");

const active = candidates[0];
const rel = path.relative(root, active).split(path.sep).map(encodeURIComponent).join("/");
const url = `http://127.0.0.1:4173/${rel}`;
const executablePath = process.env.CHROME_BIN;

if (!executablePath) throw new Error("CHROME_BIN missing");

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
});

const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.setDefaultTimeout(5000);

const errors=[];
page.on("pageerror", e=>errors.push(String(e)));

let response;
try {
  response=await page.goto(url,{waitUntil:"commit",timeout:15000});
} catch(e) {
  console.error("FAST_NAV_FAIL="+String(e));
  await browser.close().catch(()=>{});
  process.exit(1);
}

console.log("FAST_HTTP="+(response?.status() ?? "none"));
console.log("FAST_ACTIVE_INDEX="+rel);

await page.waitForTimeout(3000);

let body="";
try {
  body=(await page.locator("body").innerText({timeout:5000})).toUpperCase();
} catch(e) {
  console.error("FAST_BODY_FAIL="+String(e));
  await browser.close().catch(()=>{});
  process.exit(1);
}

const checks={
  body_nonempty:body.trim().length>0,
  guest:body.includes("GUEST")||body.includes("ゲスト"),
  initial_1000:body.includes("1,000")||body.includes("1000"),
  bet:body.includes("BET"),
  result:body.includes("RESULT"),
};

let failed=false;
for(const [k,v] of Object.entries(checks)){
  console.log(`FAST_${k}=${v?"PASS":"FAIL"}`);
  if(!v) failed=true;
}

console.log("FAST_PAGE_ERRORS="+errors.length);

try {
  await page.screenshot({path:"fast-runtime.png",timeout:5000});
} catch {}

await browser.close().catch(()=>{});

if(failed) process.exit(1);
console.log("FAST_RUNTIME=PASS");
