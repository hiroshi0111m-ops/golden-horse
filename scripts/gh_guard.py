from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]

def find_active_index():
    candidates = []
    for p in ROOT.rglob("index.html"):
        if any(part in {".git", "node_modules"} for part in p.parts):
            continue
        try:
            size = p.stat().st_size
        except OSError:
            continue
        candidates.append((size, p))
    if not candidates:
        raise SystemExit("FAIL: index.html not found")
    candidates.sort(reverse=True, key=lambda x: x[0])
    return candidates[0][1]

p = find_active_index()
text = p.read_text(encoding="utf-8", errors="replace")
size = p.stat().st_size

checks = {
    "size_gt_1MB": size > 1_000_000,
    "has_html": bool(re.search(r"<html\b", text, re.I)),
    "has_script": bool(re.search(r"<script\b", text, re.I)),
    "has_guest": ("GUEST" in text.upper()) or ("ゲスト" in text),
    "has_bet": "BET" in text.upper(),
    "has_result": "RESULT" in text.upper(),
    "has_1000": ("1000" in text) or ("1,000" in text),
}

failed = [name for name, ok in checks.items() if not ok]

print(f"ACTIVE_INDEX={p.relative_to(ROOT)}")
print(f"SIZE={size}")
for name, ok in checks.items():
    print(f"{name}={'PASS' if ok else 'FAIL'}")

if failed:
    print("FAILED_CHECKS=" + ",".join(failed))
    sys.exit(1)

print("GUARD=PASS")
