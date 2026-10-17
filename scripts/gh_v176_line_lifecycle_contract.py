from pathlib import Path
import hashlib
import subprocess
import sys


root = Path(__file__).resolve().parents[1]
generator = root / "scripts/create_v176_line_lifecycle_fix.py"
subprocess.run([sys.executable, str(generator)], check=True)

v175 = root / "checkpoints/V175_MULTITAB_LIFECYCLE_FIX/index.html"
v176 = root / "checkpoints/V176_LINE_LIFECYCLE_FIX/index.html"
assert hashlib.sha256(v175.read_bytes()).hexdigest() == (
    "06253e7289aa05fe2d868452aaf5937b74cfb03e3a79a4ee7aa808e466a32373"
)
html = v176.read_text()

required = [
    "V176-LINE-LIFECYCLE-FIX",
    "function ghV175LifecycleAudit(reason)",
    "function ghV176LineLifecycleAudit(reason)",
    "sharedDiffers:persisted!==memory",
    "skippedStaleGuestWrite:true",
    "ghV176LineLifecycleAudit('visibility-hidden')",
    "ghV176LineLifecycleAudit('pagehide')",
    "try{window.GH_V129?.save?.()}catch(_){}",
]
for token in required:
    expected = 2 if token == "sharedDiffers:persisted!==memory" else 1
    assert html.count(token) == expected, (
        f"unexpected V176 contract token count: {token}"
    )

forbidden = [
    "function saveSafe(){try{if(typeof localSave==='function')localSave()}catch(_){}",
    "hiddenAt=Date.now();saveSafe()",
    "addEventListener('pagehide',saveSafe,{capture:true})",
]
for token in forbidden:
    assert token not in html, "stale GH_LINE_PERF9 guest-state write remains"

assert html.count("gh_guest_isolated_v2_state") == 6, (
    "unexpected guest-state key surface change"
)
assert html.count(
    "function localSave(){localStorage.setItem('gh_guest_isolated_v2_state',JSON.stringify(state))}"
) == 1
assert (
    'ホーム</button><button class="gh-v60-nav-item" '
    'data-page="startPage"><span>♞</span>レース</button>'
) in html

print("V176_LINE_LIFECYCLE_CONTRACT=PASS")
print("V176_SHA256=" + hashlib.sha256(v176.read_bytes()).hexdigest())
