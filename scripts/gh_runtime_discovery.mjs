import { chromium } from "playwright-core";
import fs from "fs";

const chrome=process.env.CHROME_BIN;
const url="http://127.0.0.1:4173/checkpoints/V168_BOOT_LOOP_FIX/index.html";
const browser=await chromium.launch({executablePath:chrome,headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
const page=await browser.newPage({viewport:{width:390,height:844}});
await page.goto(url,{waitUntil:"commit",timeout:15000});
await page.waitForTimeout(2500);

const data=await page.evaluate(()=>{
  const visible=e=>{
    const s=getComputedStyle(e);
    const r=e.getBoundingClientRect();
    return s.display!=="none"&&s.visibility!=="hidden"&&r.width>0&&r.height>0;
  };
  const buttons=[...document.querySelectorAll("button,a,[role=button]")]
    .filter(visible)
    .map(e=>({
      tag:e.tagName,
      id:e.id||null,
      class:e.className||null,
      text:(e.textContent||"").trim().replace(/\s+/g," ").slice(0,180),
      href:e.getAttribute("href"),
    }))
    .slice(0,150);
  const active=[...document.querySelectorAll(".active,.on")]
    .filter(visible)
    .map(e=>({tag:e.tagName,id:e.id||null,class:e.className||null,text:(e.textContent||"").trim().replace(/\s+/g," ").slice(0,220)}))
    .slice(0,80);
  const guest=[...document.querySelectorAll("body *")]
    .filter(e=>(e.textContent||"").includes("ゲスト")&&visible(e))
    .map(e=>({tag:e.tagName,id:e.id||null,class:e.className||null,text:(e.textContent||"").trim().replace(/\s+/g," ").slice(0,300)}))
    .slice(0,50);
  return {
    title:document.title,
    body:(document.body.innerText||"").trim().slice(0,5000),
    buttons,
    active,
    guest
  };
});

console.log("DISCOVERY_TITLE="+data.title);
console.log("DISCOVERY_BODY="+JSON.stringify(data.body));
for(const x of data.buttons) console.log("VISIBLE_BUTTON="+JSON.stringify(x));
for(const x of data.active) console.log("VISIBLE_ACTIVE="+JSON.stringify(x));
for(const x of data.guest) console.log("VISIBLE_GUEST="+JSON.stringify(x));

fs.writeFileSync("runtime-discovery.json",JSON.stringify(data,null,2));
await page.screenshot({path:"runtime-discovery.png",fullPage:false}).catch(()=>{});
await browser.close();
console.log("RUNTIME_DISCOVERY=PASS");
