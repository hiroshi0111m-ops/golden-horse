from pathlib import Path
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

patterns = {
    "setInterval": r"\bsetInterval\s*\(",
    "setTimeout": r"\bsetTimeout\s*\(",
    "MutationObserver": r"\bMutationObserver\b",
    "requestAnimationFrame": r"\brequestAnimationFrame\s*\(",
    "addEventListener": r"\.addEventListener\s*\(",
}

report = {
    "active_index": str(p.relative_to(ROOT)),
    "items": {},
}

for name, pattern in patterns.items():
    rows = []
    for m in re.finditer(pattern, s):
        line = s.count("\n", 0, m.start()) + 1
        snippet = re.sub(r"\s+", " ", s[max(0, m.start()-180):m.start()+320]).strip()
        rows.append({
            "offset": m.start(),
            "line": line,
            "snippet": snippet[:500],
        })
    report["items"][name] = rows
    print(f"{name}={len(rows)}")

Path("gh-runtime-risk-report.json").write_text(
    json.dumps(report, ensure_ascii=False, indent=2),
    encoding="utf-8",
)
print("RUNTIME_RISK_REPORT=PASS")
