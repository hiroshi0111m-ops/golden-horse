import { chromium } from "playwright-core";
import fs from "fs";

const chrome=process.env.CHROME_BIN;
const url="http://127.0.0.1:4173/checkpoints/V168_BOOT_LOOP_FIX/index.html";
const report={url,startedAt:new Date().toISOString(),steps:{},events:[]};

function log(msg,obj){
  const line=obj?msg+" "+JSON.stringify(obj):msg;
  console.log(line);
  report.events.push(line);
}
async function snap(page,name){
  try{await page.screenshot({path:`seven-step-${name}.png`,fullPage:false,timeout:5000});}catch{}
}
async function runStep(page,key,fn){
  const t0=Date.now();
  try{
    const detail=await fn();
    report.steps[key]={pass:true,ms:Date.now()-t0,detail:detail??null};
    log(`STEP_${key}=PASS`,detail??undefined);
    await snap(page,key.toLowerCase());
    return detail;
  }catch(e){
    report.steps[key]={pass:false,ms:Date.now()-t0,error:String(e)};
    log(`STEP_${key}=FAIL`,{error:String(e)});
    await snap(page,key.toLowerCase()+"-fail");
    throw e;
  }
}

const browser=await chromium.launch({
  executablePath:chrome,
  headless:true,
  args:["--no-sandbox","--disable-dev-shm-usage"]
});
const context=await browser.newContext({viewport:{width:390,height:844}});
const page=await context.newPage();
page.setDefaultTimeout(8000);

const pageErrors=[];
const consoleErrors=[];
page.on("pageerror",e=>pageErrors.push(String(e)));
page.on("console",m=>{if(m.type()==="error")consoleErrors.push(m.text())});

let finalExit=0;
try{
  await runStep(page,"OPEN",async()=>{
    const res=await page.goto(url,{waitUntil:"commit",timeout:15000});
    if(!res||res.status()!==200)throw new Error("HTTP "+(res?.status()??"none"));
    await page.waitForTimeout(2500);
    const body=await page.locator("body").innerText({timeout:6000});
    if(!body.trim())throw new Error("body empty");
    return {http:res.status(),title:await page.title()};
  });

  await runStep(page,"GUEST",async()=>{
    const body=await page.locator("body").innerText();
    const guest=/体験モード|GUEST|ゲスト/i.test(body);
    if(!guest)throw new Error("guest/体験モード marker not visible");
    const activeHome=await page.locator("#home.active").count();
    return {guestMarker:true,activeHome};
  });

  await runStep(page,"BALANCE_1000",async()=>{
    const body=await page.locator("body").innerText();
    const ok=/残高\s*1,000G|残高\s*1000G|1,000G/.test(body);
    if(!ok)throw new Error("initial 1,000G marker missing");
    return {initialBalance:"1,000G"};
  });

  await runStep(page,"BET",async()=>{
    const horse=page.locator("button.horsePick").first();
    if(await horse.count()===0)throw new Error("horsePick not found");
    await horse.click();
    await page.waitForTimeout(250);

    const five=page.getByRole("button",{name:"5G",exact:true});
    if(await five.count())await five.first().click();
    await page.waitForTimeout(250);

    const bet=page.locator("#betBtn");
    await bet.waitFor({state:"visible"});

    const state=async()=>page.evaluate(()=>{
      const b=document.getElementById("betBtn");
      const picks=[...document.querySelectorAll("button.horsePick")].map((e,i)=>({
        i:i+1,class:e.className,pressed:e.getAttribute("aria-pressed"),text:(e.textContent||"").trim()
      }));
      const chips=[...document.querySelectorAll("button.chip")].map(e=>({text:(e.textContent||"").trim(),class:e.className}));
      const panel=document.querySelector(".betPanel");
      return {
        betClass:b?.className||null,
        betDisabled:!!b?.disabled,
        betTitle:b?.getAttribute("title"),
        betDataset:b?Object.fromEntries(Object.entries(b.dataset)):null,
        betOnclick:b?.onclick?String(b.onclick).slice(0,2400):null,
        secureMode:(()=>{try{return typeof secureMode==="function"?secureMode():null}catch(e){return "ERR:"+e.message}})(),
        storageKeys:Object.keys(localStorage),
        picks,
        chips,
        panelText:(panel?.innerText||"").slice(0,1200),
        integrity:[...document.querySelectorAll("body *")].map(e=>e.textContent||"").find(t=>/オッズの整合性|BETを停止|安全値へ復旧/.test(t))?.slice(0,500)||null
      };
    });

    let before=await state();
    log("BET_STATE_AFTER_SELECTION",before);

    try{
      await page.waitForFunction(()=>{
        const b=document.getElementById("betBtn");
        return !!b&&!b.disabled&&!b.classList.contains("gh-v141-notready");
      },null,{timeout:12000});
    }catch{}

    before=await state();
    log("BET_STATE_BEFORE_CLICK",before);

    await bet.click({force:true});
    await page.waitForTimeout(900);

    const slips=(await page.locator("#betSlips").innerText().catch(()=>"" )).trim();
    const after=await state();
    const toast=await page.locator(".toast,.ghToast,#toast").allInnerTexts().catch(()=>[]);
    log("BET_STATE_AFTER_CLICK",{after,slips,toast});

    const accepted=!/まだ投票はありません/.test(slips);
    if(!accepted)throw new Error("BET did not appear in MY BET: "+slips.slice(0,240)+" | class="+after.betClass+" disabled="+after.betDisabled);
    return {slips:slips.slice(0,300),betClass:after.betClass};
  });

  await runStep(page,"SKIP_TO_10",async()=>{
    const skip=page.locator("#skipBtn");
    await skip.waitFor({state:"visible"});
    await skip.click();
    await page.waitForTimeout(300);
    const txt=(await page.locator("#countdown").innerText().catch(()=>"" )).trim();
    return {countdown:txt};
  });

  await runStep(page,"SEVEN_HORSES_START",async()=>{
    await page.waitForFunction(()=>{
      const r=document.getElementById("raceScreen");
      return !!r&&r.classList.contains("on");
    },null,{timeout:25000});
    const n=await page.locator("#runners .runner").count();
    if(n!==7)throw new Error("runner count="+n);
    return {runnerCount:n};
  });

  await runStep(page,"GOAL_RESULT",async()=>{
    const finish=page.locator("#finishPanel");
    await finish.waitFor({state:"visible",timeout:65000});
    const txt=(await finish.innerText()).trim();
    if(!/RESULT|ゴール/i.test(txt))throw new Error("finish text="+txt.slice(0,240));
    const next=page.locator("#resultNext");
    await next.waitFor({state:"visible",timeout:5000});
    return {finishText:txt.slice(0,500),nextVisible:true};
  });

  await runStep(page,"NEXT_RACE",async()=>{
    const next=page.locator("#resultNext");
    await next.click();
    await page.waitForTimeout(800);
    const finishVisible=await page.locator("#finishPanel").isVisible().catch(()=>false);
    const raceOn=await page.locator("#raceScreen").evaluate(e=>e.classList.contains("on")).catch(()=>false);
    const countdown=(await page.locator("#countdown").innerText().catch(()=>"" )).trim();
    if(finishVisible)throw new Error("result still visible after next race");
    return {finishVisible,raceOn,countdown};
  });

  console.log("SEVEN_STEP_RUNTIME=PASS");
}catch(e){
  finalExit=1;
  console.error("SEVEN_STEP_RUNTIME=FAIL "+String(e));
}finally{
  report.pageErrors=pageErrors;
  report.consoleErrors=consoleErrors.slice(0,50);
  report.finishedAt=new Date().toISOString();
  fs.writeFileSync("seven-step-runtime-report.json",JSON.stringify(report,null,2));
  await context.close().catch(()=>{});
  await browser.close().catch(()=>{});
}

process.exit(finalExit);
