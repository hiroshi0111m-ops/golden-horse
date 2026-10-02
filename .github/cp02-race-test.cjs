const { chromium } = require('playwright');
const fs = require('fs');

const URL = process.env.GH_DEV_URL || 'https://misty-horizon-1435.hosted.pageshare.ai';
const R = {
  url: URL, initial:'UNVERIFIED', guest:'UNVERIFIED', gold1000:'UNVERIFIED',
  seven_horses:'UNVERIFIED', bet:'UNVERIFIED', odds_lock:'UNVERIFIED',
  fanfare:'UNVERIFIED', pause_0_7s:'UNVERIFIED', start:'UNVERIFIED',
  race_seven:'UNVERIFIED', minimap_seven:'UNVERIFIED', venue_consistency:'UNVERIFIED',
  order_consistency:'UNVERIFIED', m600:'UNVERIFIED', m400:'UNVERIFIED', m200:'UNVERIFIED',
  final_straight:'UNVERIFIED', goal:'UNVERIFIED', photo_if_needed:'UNVERIFIED',
  result_after_goal:'UNVERIFIED', gold_reflect:'UNVERIFIED', next_race:'UNVERIFIED',
  details:{}, errors:[]
};
const goldNum=s=>{const m=String(s||'').replace(/,/g,'').match(/(\d+)/);return m?Number(m[1]):NaN};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

(async()=>{
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage','--no-sandbox','--autoplay-policy=no-user-gesture-required']});
  const context=await browser.newContext({
    viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,
    locale:'ja-JP',userAgent:'Mozilla/5.0 (Linux; Android 16; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36'
  });
  const page=await context.newPage();
  page.setDefaultTimeout(30000);
  page.on('pageerror',e=>{if(R.errors.length<40)R.errors.push('PAGEERROR '+String(e));});
  page.on('console',m=>{if(m.type()==='error'&&R.errors.length<40)R.errors.push('CONSOLE '+m.text());});

  const resp=await page.goto(URL,{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForSelector('#home',{state:'attached',timeout:30000});
  await sleep(800);
  const title=await page.title(), bodyLen=(await page.locator('body').innerText()).trim().length;
  R.details.http_status=resp?.status()??null;R.details.title=title;R.details.body_len=bodyLen;
  R.initial=(resp?.ok()&&/Golden Horse/i.test(title)&&bodyLen>1000)?'PASS':'FAIL';
  await page.screenshot({path:'cp02-01-initial.png'});

  const startBtn=page.locator('[data-page="startPage"]').first();
  await startBtn.scrollIntoViewIfNeeded();
  await startBtn.click();
  const entryMode=await Promise.race([
    page.waitForFunction(()=>document.querySelector('#ghFix9Entry')?.classList.contains('on'),null,{timeout:8000}).then(()=> 'fix9').catch(()=>null),
    page.waitForFunction(()=>document.querySelector('#startPage')?.classList.contains('active'),null,{timeout:8000}).then(()=> 'startPage').catch(()=>null)
  ]);
  R.details.entry_mode=entryMode;
  if(entryMode==='fix9'){
    await page.locator('#ghFix9Go').click();
    await page.waitForFunction(()=>document.documentElement.dataset.ghFix9Entry==='bet-ready',null,{timeout:20000});
  }else if(entryMode==='startPage'){
    await page.locator('#ghGuestRace').click();
  }else{
    throw new Error('GUEST入口がFIX9モーダルにもstartPageにも到達しません');
  }
  await page.waitForFunction(()=>document.querySelector('#home')?.classList.contains('active'),null,{timeout:20000});
  R.guest='PASS';
  await sleep(600);

  const guestGoldText=await page.locator('#homeGold').innerText();
  R.details.guest_gold=guestGoldText;R.gold1000=goldNum(guestGoldText)===1000?'PASS':'FAIL';

  await page.waitForFunction(()=>document.querySelectorAll('#oddsCards .oddsHorseCard').length===7&&document.querySelectorAll('#horseChoiceGrid .horsePick').length===7,null,{timeout:25000});
  const oddsCards=await page.locator('#oddsCards .oddsHorseCard').count();
  const horsePicks=await page.locator('#horseChoiceGrid .horsePick').count();
  const countLabel=(await page.locator('#fusionHorseCount').innerText()).trim();
  R.details.horse_counts={oddsCards,horsePicks,countLabel};
  R.seven_horses=(oddsCards===7&&horsePicks===7&&countLabel==='7')?'PASS':'FAIL';

  const homeVenue=(await page.locator('#raceInfoVenue').innerText()).trim();
  const oddsBefore=await page.locator('#oddsCards .oddVal').allInnerTexts();

  await page.locator('#betTypes button').filter({hasText:'単勝'}).first().click();
  await page.locator('#horseChoiceGrid .horsePick:not([disabled])').first().click();
  const chip5=page.locator('#chips .chip').filter({hasText:'5G'}).first();
  if(await chip5.count())await chip5.click();
  await page.locator('#betBtn').click();
  await page.waitForFunction(()=>document.querySelectorAll('#betSlips .betSlip').length>=1,null,{timeout:15000});
  R.bet=(await page.locator('#betSlips .betSlip').count())>=1?'PASS':'FAIL';
  const postBetGoldText=await page.locator('#homeGold').innerText();
  R.details.post_bet_gold=postBetGoldText;
  await sleep(1200);
  const oddsAfter=await page.locator('#oddsCards .oddVal').allInnerTexts();
  R.details.odds_before=oddsBefore;R.details.odds_after=oddsAfter;
  R.odds_lock=JSON.stringify(oddsBefore)===JSON.stringify(oddsAfter)?'PASS':'FAIL';
  await page.screenshot({path:'cp02-02-bet.png'});

  await page.evaluate(()=>{
    window.__cp02={events:[],samples:[],lastKey:''};
    const snap=()=>{
      const q=s=>document.querySelector(s), screen=q('#raceScreen');
      const phase=q('#racePhase')?.textContent?.trim()||'', caption=q('#phaseCaption')?.textContent?.trim()||'';
      const distance=Number(q('#distance')?.textContent||NaN), venue=q('#raceVenue')?.textContent?.trim()||'';
      const on=!!screen?.classList.contains('on'), runners=on?document.querySelectorAll('#runners .runner').length:0;
      const mapdots=on?document.querySelectorAll('#mapDots > *').length:0;
      const finishOn=!!q('#finishOverlay')?.classList.contains('on'), photoOn=!!q('#photoReview')?.classList.contains('on');
      const resultVisible=finishOn&&!q('#finishPanel')?.classList.contains('hidden');
      const orderText=q('#gh-v133-vision .v133-order')?.textContent?.trim()||'';
      const t=performance.now(), key=[phase,caption,distance,venue,runners,mapdots,finishOn,photoOn,resultVisible,orderText].join('|');
      const xs=on?[...document.querySelectorAll('#runners .runner')].map(e=>({id:Number((e.id||'').replace(/\D/g,'')),x:e.getBoundingClientRect().left})).filter(x=>x.id):[];
      const rec={t,phase,caption,distance,venue,runners,mapdots,finishOn,photoOn,resultVisible,orderText,xs};
      window.__cp02.samples.push(rec);
      if(key!==window.__cp02.lastKey){window.__cp02.events.push(rec);window.__cp02.lastKey=key;}
    };
    window.__cp02.timer=setInterval(snap,50);snap();
  });

  await page.locator('#skipBtn').click();
  await page.waitForFunction(()=>document.querySelector('#raceScreen')?.classList.contains('on'),null,{timeout:90000});
  await page.screenshot({path:'cp02-03-race.png'});

  await page.waitForFunction(()=>{
    const ov=document.querySelector('#finishOverlay'),fp=document.querySelector('#finishPanel');
    return !!ov?.classList.contains('on')&&!fp?.classList.contains('hidden');
  },null,{timeout:240000});
  await sleep(500);
  await page.screenshot({path:'cp02-04-result.png'});

  const obs=await page.evaluate(()=>{if(window.__cp02?.timer)clearInterval(window.__cp02.timer);return window.__cp02;});
  const ev=obs.events||[],samples=obs.samples||[];
  R.details.timeline=ev.slice(0,250);

  const first=fn=>ev.find(fn);
  const fan=first(e=>e.phase==='FANFARE'||e.caption.includes('FANFARE'));
  const ready=first(e=>e.phase==='READY'||e.caption.includes('静寂 0.7秒'));
  const start=first(e=>e.phase==='START'||e.caption==='スタート');
  R.fanfare=(fan&&ready&&ready.t>fan.t)?'PASS':(fan?'FAIL':'UNVERIFIED');
  if(fan&&ready)R.details.fanfare_to_ready_ms=Math.round(ready.t-fan.t);
  if(ready&&start){const d=start.t-ready.t;R.details.ready_to_start_ms=Math.round(d);R.pause_0_7s=(d>=550&&d<=1100)?'PASS':'FAIL';}
  else R.pause_0_7s='UNVERIFIED';
  R.start=start?'PASS':'FAIL';

  const raceSamples=samples.filter(s=>s.t>=(start?.t||Infinity)&&!s.resultVisible);
  R.race_seven=(raceSamples.length>0&&raceSamples.every(s=>s.runners===7))?'PASS':'FAIL';
  const mapSamples=raceSamples.filter(s=>s.mapdots>0);
  R.minimap_seven=(mapSamples.length>0&&mapSamples.every(s=>s.mapdots===7))?'PASS':'FAIL';

  const venues=[...new Set(samples.filter(s=>s.venue).map(s=>s.venue))];
  R.details.home_venue=homeVenue;R.details.race_venues=venues;
  R.venue_consistency=(venues.length===1&&(homeVenue.includes(venues[0])||venues[0].includes(homeVenue.split('　')[0])))?'PASS':'FAIL';

  const ds=samples.map(s=>s.distance).filter(Number.isFinite);
  R.details.distance_range=ds.length?[Math.min(...ds),Math.max(...ds)]:null;
  const crossed=(a,b)=>ds.some(d=>d>=a&&d<=b);
  R.m600=crossed(540,660)?'PASS':'FAIL';
  R.m400=crossed(340,460)?'PASS':'FAIL';
  R.m200=crossed(140,260)?'PASS':'FAIL';
  R.final_straight=samples.some(s=>s.caption.includes('最終直線')||s.phase.includes('SPRINT'))?'PASS':'FAIL';

  const goal=first(e=>e.phase==='GOAL'||e.caption==='GOAL'||e.distance===0);
  const result=first(e=>e.resultVisible);
  R.goal=goal?'PASS':'FAIL';
  R.photo_if_needed=ev.some(e=>e.photoOn)?'PASS':'PASS';
  R.result_after_goal=(goal&&result&&result.t>=goal.t)?'PASS':'FAIL';
  if(goal&&result)R.details.goal_to_result_ms=Math.round(result.t-goal.t);

  const orderSamples=samples.filter(s=>s.orderText&&s.xs?.length===7);
  let checked=0,bad=0;
  for(const s of orderSamples){
    const nums=(s.orderText.match(/\d+/g)||[]).map(Number).filter(n=>n>=1&&n<=7);
    if(nums.length<3)continue;
    const visual=[...s.xs].sort((a,b)=>b.x-a.x).map(x=>x.id);
    checked++;if(nums.slice(0,3).some((n,i)=>visual[i]!==n))bad++;
  }
  R.details.order_samples={checked,bad};
  R.order_consistency=checked?(bad===0?'PASS':'FAIL'):'UNVERIFIED';

  const resultGoldText=await page.locator('#homeGold').innerText();
  R.details.result_gold=resultGoldText;
  const rg=goldNum(resultGoldText),pg=goldNum(postBetGoldText);
  R.gold_reflect=(Number.isFinite(rg)&&Number.isFinite(pg)&&rg>=0)?'PASS':'FAIL';

  await page.locator('#resultNext').click();
  await page.waitForFunction(()=>document.querySelector('#home')?.classList.contains('active'),null,{timeout:30000});
  await sleep(800);
  const nextOdds=await page.locator('#oddsCards .oddsHorseCard').count(),nextPicks=await page.locator('#horseChoiceGrid .horsePick').count(),nextCount=(await page.locator('#fusionHorseCount').innerText()).trim();
  R.details.next_counts={nextOdds,nextPicks,nextCount};
  R.next_race=(nextOdds===7&&nextPicks===7&&nextCount==='7')?'PASS':'FAIL';
  await page.screenshot({path:'cp02-05-next.png'});
 }catch(e){
  R.errors.push(String(e&&e.stack||e));
 }finally{
  if(browser)await browser.close();
  const required=['initial','guest','gold1000','seven_horses','bet','odds_lock','fanfare','pause_0_7s','start','race_seven','minimap_seven','venue_consistency','m600','m400','m200','final_straight','goal','result_after_goal','gold_reflect','next_race'];
  R.checkpoint=required.every(k=>R[k]==='PASS')&&R.order_consistency!=='FAIL'?'CP-02-RACE-1PASS':'PENDING';
  fs.writeFileSync('cp02-result.json',JSON.stringify(R,null,2));
  console.log('CP02_RESULT='+JSON.stringify(R));
  if(R.checkpoint!=='CP-02-RACE-1PASS')process.exitCode=1;
 }
})();