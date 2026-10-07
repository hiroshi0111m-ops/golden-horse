from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
WINDOW = 5000

def active_index():
    candidates = []
    for p in ROOT.rglob("index.html"):
        if any(part in {".git", "node_modules"} for part in p.parts):
            continue
        try:
            candidates.append((p.stat().st_size, p))
        except OSError:
            pass
    if not candidates:
        raise SystemExit("index.html not found")
    return max(candidates, key=lambda x: x[0])[1]

p = active_index()
s = p.read_text(encoding="utf-8", errors="replace")

patterns = {
    "setInterval": (r"\bsetInterval\s*\(", 5),
    "MutationObserver": (r"\bMutationObserver\b", 4),
    "requestAnimationFrame": (r"\brequestAnimationFrame\s*\(", 3),
    "setTimeout": (r"\bsetTimeout\s*\(", 1),
    "addEventListener": (r"\.addEventListener\s*\(", 1),
}

buckets = {}
for name, (pattern, weight) in patterns.items():
    for m in re.finditer(pattern, s):
        bucket = m.start() // WINDOW
        row = buckets.setdefault(bucket, {
            "bucket": bucket,
            "start_offset": bucket * WINDOW,
            "score": 0,
            "counts": {k: 0 for k in patterns},
        })
        row["score"] += weight
        row["counts"][name] += 1

rows = []
for row in buckets.values():
    start = row["start_offset"]
    end = min(len(s), start + WINDOW)
    row["start_line"] = s.count("\n", 0, start) + 1
    row["snippet"] = re.sub(r"\s+", " ", s[start:min(end, start + 900)]).strip()
    rows.append(row)

rows.sort(key=lambda x: (-x["score"], x["start_offset"]))
report = {
    "active_index": str(p.relative_to(ROOT)),
    "window_chars": WINDOW,
    "hotspots": rows[:50],
}

Path("gh-freeze-hotspots.json").write_text(
    json.dumps(report, ensure_ascii=False, indent=2),
    encoding="utf-8",
)

print(f"FREEZE_HOTSPOT_COUNT={len(rows)}")
for i, row in enumerate(rows[:12], 1):
    print(
        f"HOTSPOT#{i} score={row['score']} line={row['start_line']} "
        f"offset={row['start_offset']} counts={row['counts']}"
    )
print("FREEZE_HOTSPOT_REPORT=PASS")
