import { chromium } from "playwright-core";
import fs from "fs";

const chrome=process.env.CHROME_BIN;
const url="http://127.0.0.1:4173/checkpoints/V170_RACE_TIMING_FIX/index.html";
const report={url,startedAt:new Date().toISOString(),cycles:[],events:[]};

function log(message,detail){
  const line=detail?`${message} ${JSON.stringify(detail)}`:message;
  console.log(line);
  report.events.push(line);
}

async function appState(page){
  return page.evaluate(()=>({
    gold:typeof state!=="undefined"?Number(state.gold):null,
    todayRaces:typeof state!=="undefined"?Number(state.todayRaces):null,
    activeBets:typeof state!=="undefined"&&Array.isArray(state.raceBets)?state.raceBets.length:null,
    betHistory:typeof state!=="undefined"&&Array.isArray(state.betHistory)?state.betHistory.length:null,
    settled:typeof raceState!=="undefined"?!!raceState.settled:null,
    transitioning:typeof raceState!=="undefined"?!!raceState.transitioning:null,
    raceOn:document.getElementById("raceScreen")?.classList.contains("on")??false,
    finishOn:document.getElementById("finishOverlay")?.classList.contains("on")??false,
    countdown:(document.getElementById("countdown")?.textContent||"").trim()
  }));
}

async function placeFiveGoldBet(page,cycle){
  const horse=page.locator("button.horsePick").nth((cycle-1)%7);
  await horse.waitFor({state:"visible"});
  await horse.click();
  await page.getByRole("button",{name:"5G",exact:true}).first().click();
  await page.waitForFunction(()=>{
    const button=document.getElementById("betBtn");
    return !!button&&!button.disabled&&!button.classList.contains("gh-v141-notready");
  },null,{timeout:12000});
  await page.locator("#betBtn").click({force:true});
  const confirm=page.locator("#gh-v141-ok");
  await confirm.waitFor({state:"visible",timeout:5000});
  await page.waitForTimeout(700);
  await confirm.click();
  await page.waitForFunction(()=>{
    const text=(document.getElementById("betSlips")?.textContent||"").trim();
    return text.length>0&&!text.includes("まだ投票はありません");
  },null,{timeout:8000});
  return (await page.locator("#betSlips").innerText()).trim().slice(0,300);
}

async function runCycle(page,cycle){
  const started=Date.now();
  const before=await appState(page);
  if(before.raceOn||before.finishOn)throw new Error(`cycle ${cycle}: race screen was not reset`);
  if(before.activeBets!==0)throw new Error(`cycle ${cycle}: stale active bets=${before.activeBets}`);

  const slips=await placeFiveGoldBet(page,cycle);
  const afterBet=await appState(page);
  if(afterBet.gold!==before.gold-5){
    throw new Error(`cycle ${cycle}: 5G deduction mismatch ${before.gold} -> ${afterBet.gold}`);
  }
  if(afterBet.activeBets!==1)throw new Error(`cycle ${cycle}: active bets=${afterBet.activeBets}`);

  await page.locator("#skipBtn").click();
  await page.waitForFunction(()=>{
    const screen=document.getElementById("raceScreen");
    return !!screen&&screen.classList.contains("on");
  },null,{timeout:25000});
  const runners=await page.locator("#runners .runner").count();
  if(runners!==7)throw new Error(`cycle ${cycle}: runner count=${runners}`);

  const raceStarted=Date.now();
  await page.locator("#finishPanel").waitFor({state:"visible",timeout:100000});
  const resultText=(await page.locator("#finishPanel").innerText()).trim();
  if(!/OFFICIAL|RESULT|確定/i.test(resultText)){
    throw new Error(`cycle ${cycle}: official result missing: ${resultText.slice(0,240)}`);
  }
  const atResult=await appState(page);
  if(!atResult.settled)throw new Error(`cycle ${cycle}: result was not settled`);
  if(atResult.activeBets!==1)throw new Error(`cycle ${cycle}: result lost active bet before archival`);

  // The product automatically advances after the locked result hold. Avoid a
  // test-only race between that valid transition and Playwright actionability.
  const transitionMode=await page.evaluate(()=>{
    const next=document.getElementById("resultNext");
    const overlay=document.getElementById("finishOverlay");
    const panel=document.getElementById("finishPanel");
    if(!next||!overlay?.classList.contains("on")||panel?.classList.contains("hidden")){
      throw new Error("official result controls are not active");
    }
    if(next.disabled)return "automatic";
    next.click();
    return "manual";
  });
  await page.waitForFunction(()=>{
    const screen=document.getElementById("raceScreen");
    const finish=document.getElementById("finishOverlay");
    return !!screen&&!screen.classList.contains("on")&&!!finish&&!finish.classList.contains("on");
  },null,{timeout:8000});
  const after=await appState(page);
  if(after.activeBets!==0)throw new Error(`cycle ${cycle}: active bets not archived`);
  if(after.betHistory<(before.betHistory??0)+1)throw new Error(`cycle ${cycle}: bet history did not advance`);
  if(after.countdown!=="120"&&after.countdown!=="119"){
    throw new Error(`cycle ${cycle}: next-race countdown=${after.countdown}`);
  }

  const detail={
    cycle,
    durationMs:Date.now()-started,
    raceToResultMs:Date.now()-raceStarted,
    runnerCount:runners,
    goldBefore:before.gold,
    goldAfterBet:afterBet.gold,
    goldAfterResult:after.gold,
    todayRacesBefore:before.todayRaces,
    todayRacesAfter:after.todayRaces,
    historyBefore:before.betHistory,
    historyAfter:after.betHistory,
    nextCountdown:after.countdown,
    transitionMode,
    resultType:resultText.split("\n").slice(0,2).join(" / "),
    slips
  };
  log(`CYCLE_${cycle}=PASS`,detail);
  report.cycles.push({pass:true,...detail});
}

const browser=await chromium.launch({
  executablePath:chrome,
  headless:true,
  args:["--no-sandbox","--disable-dev-shm-usage"]
});
const context=await browser.newContext({viewport:{width:390,height:844}});
const page=await context.newPage();
page.setDefaultTimeout(10000);

const pageErrors=[];
const consoleErrors=[];
let mainFrameNavigations=0;
page.on("framenavigated",frame=>{if(frame===page.mainFrame())mainFrameNavigations++;});
page.on("pageerror",error=>pageErrors.push(String(error)));
page.on("console",message=>{if(message.type()==="error")consoleErrors.push(message.text());});

let exitCode=0;
try{
  const response=await page.goto(url,{waitUntil:"commit",timeout:15000});
  if(!response||response.status()!==200)throw new Error(`HTTP ${response?.status()??"none"}`);
  await page.waitForTimeout(2500);
  const body=await page.locator("body").innerText();
  if(!/体験モード|GUEST|ゲスト/i.test(body))throw new Error("guest marker missing");
  if(!/1,000G|1000G/.test(body))throw new Error("initial 1,000G marker missing");
  const initial=await appState(page);
  if(initial.gold!==1000)throw new Error(`initial gold=${initial.gold}`);

  for(let cycle=1;cycle<=3;cycle++)await runCycle(page,cycle);

  if(mainFrameNavigations!==1)throw new Error(`unexpected page reload/navigation count=${mainFrameNavigations}`);
  if(pageErrors.length)throw new Error(`uncaught page errors: ${pageErrors.join(" | ")}`);
  log("PAGE_RELOADS=0");
  log("PAGE_ERRORS=0");
  log("THREE_CYCLE_RUNTIME=PASS");
}catch(error){
  exitCode=1;
  report.failure=String(error);
  console.error(`THREE_CYCLE_RUNTIME=FAIL ${String(error)}`);
  await page.screenshot({path:"three-cycle-failure.png",fullPage:false,timeout:5000}).catch(()=>{});
}finally{
  report.mainFrameNavigations=mainFrameNavigations;
  report.pageReloads=Math.max(0,mainFrameNavigations-1);
  report.pageErrors=pageErrors;
  report.consoleErrors=consoleErrors.slice(0,100);
  report.finishedAt=new Date().toISOString();
  fs.writeFileSync("three-cycle-runtime-report.json",JSON.stringify(report,null,2));
  await context.close().catch(()=>{});
  await browser.close().catch(()=>{});
}

process.exit(exitCode);
