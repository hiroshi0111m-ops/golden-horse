from pathlib import Path
import hashlib
import subprocess
import sys


root = Path(__file__).resolve().parents[1]
generator = root / "scripts/create_v175_multitab_lifecycle_fix.py"
subprocess.run([sys.executable, str(generator)], check=True)

v174 = root / "checkpoints/V174_FINAL_FIVE_TABS/index.html"
v175 = root / "checkpoints/V175_MULTITAB_LIFECYCLE_FIX/index.html"
assert hashlib.sha256(v174.read_bytes()).hexdigest() == "d82fb5b0ec222f56340cd7eaf10bebfe63fda004f31348c39c0b9857a61319d8"
html = v175.read_text()

required = [
    "V175-MULTITAB-LIFECYCLE-FIX",
    "function ghV175LifecycleAudit(reason)",
    "sharedDiffers:persisted!==memory",
    "skippedStaleWrite:true",
    "ghV175LifecycleAudit('pagehide')",
    "ghV175LifecycleAudit('visibility-hidden')",
]
for token in required:
    assert html.count(token) == 1, f"missing or duplicate V175 contract token: {token}"

forbidden = [
    "window.addEventListener('pagehide',()=>{ try{ if(typeof localSave==='function') localSave(); }catch(e){} });",
    "document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='hidden'){ try{ if(typeof localSave==='function') localSave(); }catch(e){} } });",
]
for token in forbidden:
    assert token not in html, "stale FRIEND-V109 lifecycle write remains"

assert html.count("gh_guest_isolated_v2_state") == 6, "unexpected guest-state key surface change"
assert html.count("function localSave(){localStorage.setItem('gh_guest_isolated_v2_state',JSON.stringify(state))}") == 1
assert "ホーム</button><button class=\"gh-v60-nav-item\" data-page=\"startPage\"><span>♞</span>レース</button>" in html
assert html.count('button class="horsePick"') == 7

print("V175_MULTITAB_LIFECYCLE_CONTRACT=PASS")
print("V175_SHA256=" + hashlib.sha256(v175.read_bytes()).hexdigest())
