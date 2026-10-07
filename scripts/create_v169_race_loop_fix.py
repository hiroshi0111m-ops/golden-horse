from pathlib import Path
import hashlib
import re

root = Path(__file__).resolve().parents[1]
source = root / 'checkpoints/V168_BOOT_LOOP_FIX/index.html'
raw = source.read_bytes()
assert hashlib.sha256(raw).hexdigest() == 'fa8e3e100064c76f85ca07efdec413046af6e970778824dba05c1e150273043e', 'V168 baseline changed'
html = raw.decode()
pattern = r'(<script id="gh-integrated24-audio-venue"[^>]*>)(.*?)(</script>)'
match = re.search(pattern, html, re.S)
assert match, 'atmosphere script missing'
body = match[2]
old = "modes.forEach(x=>r.classList.remove(x));r.classList.add(mode);"
assert body.count(old) == 1
body = body.replace(old, "modes.forEach(x=>r.classList.toggle(x,x===mode));")
html = html[:match.start(2)] + body + html[match.end(2):]
html = html.replace('V168-BOOT-LOOP-FIX', 'V169-RACE-LOOP-FIX', 1)
output = root / 'checkpoints/V169_RACE_LOOP_FIX/index.html'
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(html)
print('V169_OUTPUT=' + str(output.relative_to(root)))
print('V169_SHA256=' + hashlib.sha256(output.read_bytes()).hexdigest())
