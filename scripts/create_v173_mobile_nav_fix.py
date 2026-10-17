from pathlib import Path
import hashlib
import subprocess
import sys


root = Path(__file__).resolve().parents[1]
subprocess.run([sys.executable, str(root / "scripts/create_v172_csp_image_fix.py")], check=True)

source = root / "checkpoints/V172_CSP_IMAGE_FIX/index.html"
raw = source.read_bytes()
assert hashlib.sha256(raw).hexdigest() == "6994e73c0d29512a268f545cfc1d146f1720fc0002b97a83362b26cd7b488f42", "V172 candidate changed"
html = raw.decode()

badge_old = "function showDemoBadge(){if(!GH_DEMO)return;const d=document.createElement('div');d.textContent='動作確認モード / GPS・ログイン判定のみ省略';d.style.cssText='position:fixed;left:8px;bottom:8px;z-index:9999;background:#5b3508ee;color:#ffe7a0;border:1px solid #e8b94f;border-radius:10px;padding:7px 10px;font:700 11px system-ui;pointer-events:none';document.body.appendChild(d)}"
badge_new = "function showDemoBadge(){if(!GH_DEMO||document.getElementById('gh-demo-mode-badge'))return;const d=document.createElement('div');d.id='gh-demo-mode-badge';d.textContent='動作確認モード / GPS・ログイン判定のみ省略';d.style.cssText='position:fixed;left:8px;bottom:8px;z-index:9999;background:#5b3508ee;color:#ffe7a0;border:1px solid #e8b94f;border-radius:10px;padding:7px 10px;font:700 11px system-ui;pointer-events:none';document.body.appendChild(d);const place=()=>{const nav=document.querySelector('.gh-v60-nav');d.style.bottom=((nav?Math.ceil(nav.getBoundingClientRect().height):0)+8)+'px'};place();requestAnimationFrame(place);addEventListener('resize',place,{passive:true});if(window.visualViewport)window.visualViewport.addEventListener('resize',place,{passive:true})}"
assert html.count(badge_old) == 1, "V172 demo badge implementation not found"
html = html.replace(badge_old, badge_new, 1)

assert html.count("V172-CSP-IMAGE-FIX") == 1, "V172 build marker not found"
html = html.replace("V172-CSP-IMAGE-FIX", "V173-MOBILE-NAV-SAFE-AREA", 1)

output = root / "checkpoints/V173_MOBILE_NAV_SAFE_AREA/index.html"
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(html)
print("V173_OUTPUT=" + str(output.relative_to(root)))
print("V173_SHA256=" + hashlib.sha256(output.read_bytes()).hexdigest())
