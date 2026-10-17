from pathlib import Path
import hashlib
import subprocess
import sys


root = Path(__file__).resolve().parents[1]
subprocess.run(
    [sys.executable, str(root / "scripts/create_v175_multitab_lifecycle_fix.py")],
    check=True,
)

source = root / "checkpoints/V175_MULTITAB_LIFECYCLE_FIX/index.html"
raw = source.read_bytes()
assert hashlib.sha256(raw).hexdigest() == (
    "06253e7289aa05fe2d868452aaf5937b74cfb03e3a79a4ee7aa808e466a32373"
), "V175 candidate changed"
html = raw.decode()

line_lifecycle_old = """function saveSafe(){try{if(typeof localSave==='function')localSave()}catch(_){}try{window.GH_V129?.save?.()}catch(_){} }
function resumeAudioOnGesture(){if(!needsAudioGesture)return;needsAudioGesture=false;try{if(typeof sound!=='undefined'&&sound!==false&&typeof ensureAudio==='function')ensureAudio()}catch(_){}try{const a=window.__ghV37Audio;if(a?.state==='suspended')a.resume().catch(()=>{})}catch(_){} }
function refresh(reason){lastReason=reason;resumes++;document.documentElement.style.setProperty('--gh143-vh',(((window.visualViewport?.height||innerHeight)*.01))+'px');try{window.GH_V126?.snapshot?.()}catch(_){}try{window.GH_V140?.audit?.()}catch(_){}if(raceOn())needsAudioGesture=true;document.dispatchEvent(new CustomEvent('gh:line-resume-safe',{detail:{reason,raceOn:raceOn(),at:Date.now()}}));}
document.addEventListener('pointerdown',resumeAudioOnGesture,{passive:true,capture:true});
document.addEventListener('touchstart',resumeAudioOnGesture,{passive:true,capture:true});
document.addEventListener('visibilitychange',()=>{if(document.hidden){hiddenAt=Date.now();saveSafe()}else if(hiddenAt){refresh('visibility');hiddenAt=0}});
addEventListener('pagehide',saveSafe,{capture:true});"""
line_lifecycle_new = """function ghV176LineLifecycleAudit(reason){
  try{
    const persisted=localStorage.getItem('gh_guest_isolated_v2_state')||'';
    const memory=(typeof state==='object'&&state)?JSON.stringify(state):'';
    window.__ghV176LineLifecycleAudit=Object.freeze({
      reason,
      sharedDiffers:persisted!==memory,
      skippedStaleGuestWrite:true,
      at:new Date().toISOString()
    });
  }catch(_){}
  try{window.GH_V129?.save?.()}catch(_){}
}
function resumeAudioOnGesture(){if(!needsAudioGesture)return;needsAudioGesture=false;try{if(typeof sound!=='undefined'&&sound!==false&&typeof ensureAudio==='function')ensureAudio()}catch(_){}try{const a=window.__ghV37Audio;if(a?.state==='suspended')a.resume().catch(()=>{})}catch(_){} }
function refresh(reason){lastReason=reason;resumes++;document.documentElement.style.setProperty('--gh143-vh',(((window.visualViewport?.height||innerHeight)*.01))+'px');try{window.GH_V126?.snapshot?.()}catch(_){}try{window.GH_V140?.audit?.()}catch(_){}if(raceOn())needsAudioGesture=true;document.dispatchEvent(new CustomEvent('gh:line-resume-safe',{detail:{reason,raceOn:raceOn(),at:Date.now()}}));}
document.addEventListener('pointerdown',resumeAudioOnGesture,{passive:true,capture:true});
document.addEventListener('touchstart',resumeAudioOnGesture,{passive:true,capture:true});
document.addEventListener('visibilitychange',()=>{if(document.hidden){hiddenAt=Date.now();ghV176LineLifecycleAudit('visibility-hidden')}else if(hiddenAt){refresh('visibility');hiddenAt=0}});
addEventListener('pagehide',()=>ghV176LineLifecycleAudit('pagehide'),{capture:true});"""
assert html.count(line_lifecycle_old) == 1, (
    "V175 GH_LINE_PERF9 stale guest-state lifecycle saver not found exactly once"
)
html = html.replace(line_lifecycle_old, line_lifecycle_new, 1)

assert html.count("V175-MULTITAB-LIFECYCLE-FIX") == 1, "V175 build marker not found"
html = html.replace(
    "V175-MULTITAB-LIFECYCLE-FIX",
    "V176-LINE-LIFECYCLE-FIX",
    1,
)

output = root / "checkpoints/V176_LINE_LIFECYCLE_FIX/index.html"
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(html)
print("V176_OUTPUT=" + str(output.relative_to(root)))
print("V176_SHA256=" + hashlib.sha256(output.read_bytes()).hexdigest())
