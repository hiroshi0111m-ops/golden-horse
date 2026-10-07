from pathlib import Path
import hashlib
import subprocess
import sys


root = Path(__file__).resolve().parents[1]
subprocess.run([sys.executable, str(root / "scripts/create_v171_three_cycle_fix.py")], check=True)

source = root / "checkpoints/V171_THREE_CYCLE_FIX/index.html"
raw = source.read_bytes()
assert hashlib.sha256(raw).hexdigest() == "4fd44b35c8c5c76901a2b6250eea22fb5968457f84acb57920a0eafc47409ada", "V171 candidate changed"
html = raw.decode()

csp_old = "img-src data: blob: https://commons.wikimedia.org https://upload.wikimedia.org;"
csp_new = "img-src data: blob: https://commons.wikimedia.org https://upload.wikimedia.org https://thumb.wikimedia.org;"
assert html.count(csp_old) == 1, "V171 image CSP not found"
html = html.replace(csp_old, csp_new, 1)

assert html.count("V171-THREE-CYCLE-FIX") == 1, "V171 build marker not found"
html = html.replace("V171-THREE-CYCLE-FIX", "V172-CSP-IMAGE-FIX", 1)

output = root / "checkpoints/V172_CSP_IMAGE_FIX/index.html"
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(html)
print("V172_OUTPUT=" + str(output.relative_to(root)))
print("V172_SHA256=" + hashlib.sha256(output.read_bytes()).hexdigest())
