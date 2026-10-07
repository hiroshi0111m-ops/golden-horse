import os
from pathlib import Path
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
BASELINE_PATH = ROOT / "quality-baseline.json"


def find_active_index() -> Path:
    if os.environ.get("GH_ACTIVE_INDEX"):
        candidate = (ROOT / os.environ["GH_ACTIVE_INDEX"]).resolve()
        if not candidate.is_file() or not candidate.is_relative_to(ROOT):
            raise SystemExit("invalid GH_ACTIVE_INDEX")
        return candidate
    candidates = []
    for p in ROOT.rglob("index.html"):
        if any(part in {".git", "node_modules"} for part in p.parts):
            continue
        try:
            candidates.append((p.stat().st_size, p))
        except OSError:
            pass
    if not candidates:
        raise SystemExit("FAIL: index.html not found")
    candidates.sort(reverse=True, key=lambda x: x[0])
    return candidates[0][1]


baseline = json.loads(BASELINE_PATH.read_text(encoding="utf-8"))
index = find_active_index()
text = index.read_text(encoding="utf-8", errors="replace")

counts = {
    "setInterval": len(re.findall(r"\bsetInterval\s*\(", text)),
    "setTimeout": len(re.findall(r"\bsetTimeout\s*\(", text)),
    "MutationObserver": len(re.findall(r"\bMutationObserver\b", text)),
    "addEventListener": len(re.findall(r"\.addEventListener\s*\(", text)),
    "script_tags": len(re.findall(r"<script\b", text, re.I)),
}

size = index.stat().st_size
size_limit = int(baseline["index_bytes"] * baseline["limits"]["index_bytes_multiplier"])
count_multiplier = baseline["limits"]["count_multiplier"]

print(f"ACTIVE_INDEX={index.relative_to(ROOT)}")
print(f"INDEX_BYTES={size}")
print(f"INDEX_BYTES_BASELINE={baseline['index_bytes']}")
print(f"INDEX_BYTES_LIMIT={size_limit}")

failed = False

if size > size_limit:
    print("FAIL:index_bytes=bloat_limit_exceeded")
    failed = True
else:
    print("PASS:index_bytes")

for key, value in counts.items():
    base = baseline["counts"][key]
    limit = int(base * count_multiplier)
    state = "PASS" if value <= limit else "FAIL"
    print(f"{state}:{key}={value} baseline={base} limit={limit}")
    if value > limit:
        failed = True

# Informational signals only. These can exist legitimately in this legacy single-file app.
signals = {
    "eval": len(re.findall(r"\beval\s*\(", text)),
    "new_Function": len(re.findall(r"\bnew\s+Function\s*\(", text)),
    "document_write": len(re.findall(r"\bdocument\.write\s*\(", text)),
    "innerHTML_assign": len(re.findall(r"\.innerHTML\s*=", text)),
}
for key, value in signals.items():
    print(f"INFO:{key}={value}")

if failed:
    sys.exit(1)

print("QUALITY_GUARD=PASS")
