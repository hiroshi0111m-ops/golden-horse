from pathlib import Path
from collections import Counter
import json
import re

ROOT = Path(__file__).resolve().parents[1]

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

ids = re.findall(r'\bid\s*=\s*["\']([^"\']+)["\']', s, flags=re.I)
counts = Counter(ids)
duplicates = {k: v for k, v in counts.items() if v > 1}

script_srcs = re.findall(r'<script\b[^>]*\bsrc\s*=\s*["\']([^"\']+)["\']', s, flags=re.I)
src_counts = Counter(script_srcs)
duplicate_script_srcs = {k: v for k, v in src_counts.items() if v > 1}

buttons = re.findall(r'<button\b([^>]*)>', s, flags=re.I)
buttons_without_type = sum(1 for attrs in buttons if not re.search(r'\btype\s*=', attrs, flags=re.I))

report = {
    "active_index": str(p.relative_to(ROOT)),
    "total_ids": len(ids),
    "unique_ids": len(counts),
    "duplicate_id_count": len(duplicates),
    "duplicate_ids": dict(sorted(duplicates.items(), key=lambda kv: (-kv[1], kv[0]))[:300]),
    "script_src_count": len(script_srcs),
    "duplicate_script_src_count": len(duplicate_script_srcs),
    "duplicate_script_srcs": duplicate_script_srcs,
    "button_count": len(buttons),
    "buttons_without_type": buttons_without_type,
    "inline_onclick_count": len(re.findall(r'\bonclick\s*=', s, flags=re.I)),
    "style_tag_count": len(re.findall(r'<style\b', s, flags=re.I)),
    "script_tag_count": len(re.findall(r'<script\b', s, flags=re.I)),
}

Path("gh-dom-integrity-report.json").write_text(
    json.dumps(report, ensure_ascii=False, indent=2),
    encoding="utf-8",
)

for k, v in report.items():
    if not isinstance(v, dict):
        print(f"{k}={v}")
print("DOM_INTEGRITY_REPORT=PASS")
