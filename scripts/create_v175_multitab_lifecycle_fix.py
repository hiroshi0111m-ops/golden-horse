from pathlib import Path
import hashlib
import subprocess
import sys


root = Path(__file__).resolve().parents[1]
subprocess.run([sys.executable, str(root / "scripts/create_v174_final_tabs_fix.py")], check=True)

source = root / "checkpoints/V174_FINAL_FIVE_TABS/index.html"
raw = source.read_bytes()
assert hashlib.sha256(raw).hexdigest() == "d82fb5b0ec222f56340cd7eaf10bebfe63fda004f31348c39c0b9857a61319d8", "V174 candidate changed"
html = raw.decode()

lifecycle_old = """  window.addEventListener('pagehide',()=>{ try{ if(typeof localSave==='function') localSave(); }catch(e){} });
  document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='hidden'){ try{ if(typeof localSave==='function') localSave(); }catch(e){} } });"""
lifecycle_new = """  function ghV175LifecycleAudit(reason){
    try{
      const persisted=localStorage.getItem('gh_guest_isolated_v2_state')||'';
      const memory=(typeof state==='object'&&state)?JSON.stringify(state):'';
      window.__ghV175LifecycleAudit=Object.freeze({
        reason,
        sharedDiffers:persisted!==memory,
        skippedStaleWrite:true,
        at:new Date().toISOString()
      });
    }catch(e){}
  }
  window.addEventListener('pagehide',()=>ghV175LifecycleAudit('pagehide'));
  document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='hidden') ghV175LifecycleAudit('visibility-hidden'); });"""
assert html.count(lifecycle_old) == 1, "V174 FRIEND-V109 lifecycle saver not found exactly once"
html = html.replace(lifecycle_old, lifecycle_new, 1)

assert html.count("V174-FINAL-FIVE-TABS") == 1, "V174 build marker not found"
html = html.replace("V174-FINAL-FIVE-TABS", "V175-MULTITAB-LIFECYCLE-FIX", 1)

output = root / "checkpoints/V175_MULTITAB_LIFECYCLE_FIX/index.html"
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(html)
print("V175_OUTPUT=" + str(output.relative_to(root)))
print("V175_SHA256=" + hashlib.sha256(output.read_bytes()).hexdigest())
