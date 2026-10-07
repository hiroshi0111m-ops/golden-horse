from pathlib import Path
import hashlib
import subprocess
import sys


root = Path(__file__).resolve().parents[1]
subprocess.run([sys.executable, str(root / "scripts/create_v169_race_loop_fix.py")], check=True)

source = root / "checkpoints/V169_RACE_LOOP_FIX/index.html"
raw = source.read_bytes()
assert hashlib.sha256(raw).hexdigest() == "6c22d978ea3737ffafddd6ffa59092ef5ed866e962932945c9639780bd45dfc1", "V169 candidate changed"
html = raw.decode()

start_old = """ async function runRacePhase(key,d,label,tg,token){
  if(!running||raceState.skipRequested)return true;
  raceState.currentKey=key;raceState.phaseIndex++;"""
start_new = """ async function runRacePhase(key,d,label,tg,token){
  if(!running||raceState.skipRequested)return true;
  const phaseStarted=performance.now();
  raceState.currentKey=key;raceState.phaseIndex++;"""
assert html.count(start_old) == 1, "active runRacePhase start not found"
html = html.replace(start_old, start_new, 1)

wait_old = """  if(key==='goal')return false;
  return raceWait(key==='sprint'||key==='final'?650:900,token);
 }"""
wait_new = """  if(key==='goal')return false;
  // Keep the visible race itself inside the locked 30-40 second window,
  // independent of whether speech synthesis resolves immediately or slowly.
  const minPhaseMs={start:5400,first:5200,back:5200,battle600:5200,sprint:5600,final:5800}[key]||5200;
  return raceWait(Math.max(0,minPhaseMs-(performance.now()-phaseStarted)),token);
 }"""
assert html.count(wait_old) == 1, "active runRacePhase wait not found"
html = html.replace(wait_old, wait_new, 1)

html = html.replace("V169-RACE-LOOP-FIX", "V170-RACE-TIMING-FIX", 1)
output = root / "checkpoints/V170_RACE_TIMING_FIX/index.html"
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(html)
print("V170_OUTPUT=" + str(output.relative_to(root)))
print("V170_SHA256=" + hashlib.sha256(output.read_bytes()).hexdigest())
