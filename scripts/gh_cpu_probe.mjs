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
const cdp = await page.context().newCDPSession(page);

await cdp.send("Profiler.enable");
await cdp.send("Profiler.setSamplingInterval", { interval: 1000 });
await cdp.send("Profiler.start");

await page.goto(url, { waitUntil: "commit", timeout: 30000 });
await new Promise(resolve => setTimeout(resolve, 10000));

const stop = cdp.send("Profiler.stop");
const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Profiler.stop timeout")), 20000));

try {
  const { profile } = await Promise.race([stop, timeout]);
  fs.writeFileSync("golden-horse-cpu-profile.json", JSON.stringify(profile));

  const top = [...profile.nodes]
    .filter(n => (n.hitCount || 0) > 0)
    .sort((a, b) => (b.hitCount || 0) - (a.hitCount || 0))
    .slice(0, 25)
    .map(n => ({
      hitCount: n.hitCount || 0,
      functionName: n.callFrame.functionName || "(anonymous)",
      url: n.callFrame.url || "",
      line: (n.callFrame.lineNumber ?? -1) + 1,
      column: (n.callFrame.columnNumber ?? -1) + 1,
    }));

  console.log("CPU_HOTSPOTS");
  for (const item of top) console.log(JSON.stringify(item));
} catch (err) {
  console.error(`CPU_PROBE_FAIL=${String(err)}`);
  process.exitCode = 1;
}

await browser.close().catch(() => {});
