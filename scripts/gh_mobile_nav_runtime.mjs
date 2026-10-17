import { chromium } from "playwright";
import fs from "fs";

const url = process.env.GH_MOBILE_NAV_URL || "http://127.0.0.1:4173/checkpoints/V172_CSP_IMAGE_FIX/index.html";
const report = {
  url,
  viewport: { width: 390, height: 844 },
  startedAt: new Date().toISOString(),
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: report.viewport,
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
});
const page = await context.newPage();
page.setDefaultTimeout(15_000);

let exitCode = 0;
try {
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  report.http = response?.status() ?? null;
  if (report.http !== 200) throw new Error(`HTTP ${report.http}`);

  await page.waitForFunction(() => {
    const nav = document.querySelector("nav.gh-v60-nav");
    const badge = [...document.querySelectorAll("body *")].find(element => {
      const text = (element.textContent || "").replace(/\s+/g, " ").trim();
      return text.includes("動作確認モード") && getComputedStyle(element).position === "fixed";
    });
    return !!nav && !!badge && nav.querySelectorAll("button").length === 5;
  });

  report.layout = await page.evaluate(() => {
    const nav = document.querySelector("nav.gh-v60-nav");
    const buttons = [...nav.querySelectorAll("button")];
    const raceButton = buttons.find(button => /レース/.test(button.textContent || "")) ||
      buttons.find(button => /startPage/.test(button.getAttribute("onclick") || "")) ||
      buttons[1];
    const badge = [...document.querySelectorAll("body *")].find(element => {
      const text = (element.textContent || "").replace(/\s+/g, " ").trim();
      return text.includes("動作確認モード") && getComputedStyle(element).position === "fixed";
    });

    const navRect = nav.getBoundingClientRect();
    const badgeRect = badge.getBoundingClientRect();
    const raceRect = raceButton.getBoundingClientRect();
    const hit = document.elementFromPoint(
      raceRect.left + raceRect.width / 2,
      raceRect.top + raceRect.height / 2,
    );
    const overlapWidth = Math.max(0, Math.min(navRect.right, badgeRect.right) - Math.max(navRect.left, badgeRect.left));
    const overlapHeight = Math.max(0, Math.min(navRect.bottom, badgeRect.bottom) - Math.max(navRect.top, badgeRect.top));
    const overlapArea = overlapWidth * overlapHeight;

    return {
      nav: {
        top: navRect.top,
        right: navRect.right,
        bottom: navRect.bottom,
        left: navRect.left,
        width: navRect.width,
        height: navRect.height,
      },
      badge: {
        top: badgeRect.top,
        right: badgeRect.right,
        bottom: badgeRect.bottom,
        left: badgeRect.left,
        width: badgeRect.width,
        height: badgeRect.height,
        text: (badge.textContent || "").replace(/\s+/g, " ").trim(),
        pointerEvents: getComputedStyle(badge).pointerEvents,
        zIndex: getComputedStyle(badge).zIndex,
      },
      raceButton: {
        text: (raceButton.textContent || "").replace(/\s+/g, " ").trim(),
        top: raceRect.top,
        right: raceRect.right,
        bottom: raceRect.bottom,
        left: raceRect.left,
        width: raceRect.width,
        height: raceRect.height,
        hitTag: hit?.tagName || null,
        hitId: hit?.id || null,
        hitClass: typeof hit?.className === "string" ? hit.className : null,
        receivesPoint: hit === raceButton || !!hit?.closest?.("button")?.isSameNode(raceButton),
      },
      buttonTexts: buttons.map(button => (button.textContent || "").replace(/\s+/g, " ").trim()),
      overlapWidth,
      overlapHeight,
      overlapArea,
    };
  });

  await page.screenshot({ path: "mobile-nav-390.png", fullPage: false });

  if (report.layout.overlapArea > 0) {
    throw new Error(`demo badge overlaps bottom nav by ${report.layout.overlapWidth.toFixed(1)}x${report.layout.overlapHeight.toFixed(1)}px`);
  }
  if (!report.layout.raceButton.receivesPoint) {
    throw new Error(`race tab center is intercepted by ${report.layout.raceButton.hitTag}.${report.layout.raceButton.hitClass || ""}`);
  }
  if (!/レース/.test(report.layout.raceButton.text)) {
    throw new Error(`race tab label missing: ${report.layout.raceButton.text}`);
  }

  const raceButton = page.locator("nav.gh-v60-nav button").filter({ hasText: "レース" }).first();
  await raceButton.click();
  await page.waitForFunction(() => {
    const home = document.getElementById("home");
    return !!document.querySelector("button.horsePick") && !!home && !home.classList.contains("active");
  });

  report.pass = true;
  console.log(`MOBILE_NAV=PASS ${JSON.stringify(report.layout)}`);
} catch (error) {
  exitCode = 1;
  report.pass = false;
  report.error = String(error);
  await page.screenshot({ path: "mobile-nav-390-failure.png", fullPage: false }).catch(() => {});
  console.error(`MOBILE_NAV=FAIL ${String(error)}`);
} finally {
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync("mobile-nav-report.json", JSON.stringify(report, null, 2));
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}

process.exit(exitCode);
