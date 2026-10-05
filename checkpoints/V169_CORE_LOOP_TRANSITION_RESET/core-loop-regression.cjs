// Regression: retaining the prior race transition latch blocks the second result.
// Execute the actual overriding startRace and finishAndReturn from the shipped HTML.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(process.argv[2], 'utf8');
const startAt = html.indexOf('startRace=async function(){');
assert.ok(startAt >= 0);
const startEnd = html.indexOf('\n const rs=', startAt);
const finishAt = html.indexOf('function finishAndReturn(){');
const finishEnd = html.indexOf('\nfunction setPhotoJudgeStage', finishAt);
const startSource = html.slice(startAt, startEnd);
const finishSource = html.slice(finishAt, finishEnd);
const next = {disabled:false,textContent:'次のレース準備へ'};
const overlay = {classList:{contains:name=>name==='on'}};
const panel = {classList:{contains:()=>false}};
const boundary = new Error('race plan boundary reached');
const context = vm.createContext({
 running:false,raceState:{transitioning:false},state:{raceBets:[],betHistory:[]},
 $:selector=>({'#resultNext':next,'#finishOverlay':overlay,'#finishPanel':panel})[selector],
 ANNOUNCERS:[{}],ann:null,speechSynthesis:{cancel(){}},
 stopBettingBgm(){},makeRacePlan(){throw boundary},
 resultTimer:0,clearInterval(){},stopGallopLoop(){},save(){},
 closeRace(){context.running=false},venueIndex:0,VENUES:['A','B'],window:{},
 setRaceTheme(){},nextLocalOdds(){},enforceOddsInvariant(){},renderOdds(){},
 renderBetSlips(){},renderHome(){},readyCount:0,startCountdown(){context.readyCount++}
});
vm.runInContext(startSource+'\n'+finishSource,context);
(async()=>{
 for(let run=1;run<=3;run++){
  try{await context.startRace()}catch(e){assert.equal(e,boundary)}
  assert.equal(next.disabled,false,`RUN${run}: next-result control must be enabled for this race`);
  assert.equal(context.finishAndReturn(),true,`RUN${run}: RESULT must transition to usable next BET`);
  assert.equal(context.readyCount,run);
  assert.equal(context.finishAndReturn(),false,`RUN${run}: duplicate result must remain blocked`);
  // Start another race in the same session, with the completed result's latch and disabled button intact.
 }
 assert.equal(context.readyCount,3);
 console.log('PASS: three consecutive transitions; duplicate callbacks remain blocked');
})().catch(e=>{console.error(e);process.exitCode=1});

