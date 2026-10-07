from pathlib import Path
import hashlib
import subprocess
import sys


root = Path(__file__).resolve().parents[1]
subprocess.run([sys.executable, str(root / "scripts/create_v170_race_timing_fix.py")], check=True)

source = root / "checkpoints/V170_RACE_TIMING_FIX/index.html"
raw = source.read_bytes()
assert hashlib.sha256(raw).hexdigest() == "061da7b16b5d1afdf45485cae297cde08f7cc882508276ad91359e57e0aa2826", "V170 candidate changed"
html = raw.decode()

start_old = """ startRace=async function(){
  if(running)return;
  running=true;stopBettingBgm();try{speechSynthesis.cancel()}catch(e){}"""
start_new = """ startRace=async function(){
  if(running)return;
  // The active race implementation must restore every result-transition guard.
  // Without this, race two reaches RESULT with transitioning=true and cannot exit.
  running=true;raceState.skipInProgress=false;raceState.transitioning=false;
  const nextBtn=$('#resultNext');if(nextBtn){nextBtn.disabled=false;nextBtn.textContent='次のレース準備へ';}
  stopBettingBgm();try{speechSynthesis.cancel()}catch(e){}"""
assert html.count(start_old) == 1, "active startRace override not found"
html = html.replace(start_old, start_new, 1)

html = html.replace("V170-RACE-TIMING-FIX", "V171-THREE-CYCLE-FIX", 1)
output = root / "checkpoints/V171_THREE_CYCLE_FIX/index.html"
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(html)
print("V171_OUTPUT=" + str(output.relative_to(root)))
print("V171_SHA256=" + hashlib.sha256(output.read_bytes()).hexdigest())
