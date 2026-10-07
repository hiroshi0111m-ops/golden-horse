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

mutation_tokens = [
    ".innerHTML", ".outerHTML", ".append(", ".appendChild(", ".prepend(",
    ".insertAdjacent", ".remove(", ".replaceWith(", ".setAttribute(",
    ".classList.", ".style.", "textContent=", "innerText="
]

rows = []
for m in re.finditer(r"new\s+MutationObserver\s*\(", s):
    start = max(0, m.start() - 500)
    end = min(len(s), m.start() + 3500)
    chunk = s[start:end]
    line = s.count("\n", 0, m.start()) + 1

    broad = bool(re.search(
        r"\.observe\s*\(\s*(?:document|document\.body|document\.documentElement|root|body)\b",
        chunk,
        re.I,
    ))
    subtree = bool(re.search(r"subtree\s*:\s*true", chunk, re.I))
    child_list = bool(re.search(r"childList\s*:\s*true", chunk, re.I))
    attributes = bool(re.search(r"attributes\s*:\s*true", chunk, re.I))

    mutations = {tok: chunk.count(tok) for tok in mutation_tokens}
    mutation_count = sum(mutations.values())
    raf = len(re.findall(r"requestAnimationFrame\s*\(", chunk))
    timeout = len(re.findall(r"setTimeout\s*\(", chunk))
    interval = len(re.findall(r"setInterval\s*\(", chunk))

    score = 0
    if broad: score += 8
    if subtree: score += 5
    if child_list: score += 3
    if attributes: score += 2
    score += min(20, mutation_count * 2)
    score += min(8, raf * 2)
    score += min(6, timeout)
    score += min(6, interval * 2)

    rows.append({
        "line": line,
        "offset": m.start(),
        "score": score,
        "broad_target": broad,
        "subtree": subtree,
        "childList": child_list,
        "attributes": attributes,
        "mutation_count": mutation_count,
        "mutation_tokens": {k:v for k,v in mutations.items() if v},
        "requestAnimationFrame": raf,
        "setTimeout": timeout,
        "setInterval": interval,
        "snippet": re.sub(r"\s+", " ", chunk).strip()[:1200],
    })

rows.sort(key=lambda x: (-x["score"], x["offset"]))

# Also find very fast setInterval declarations.
fast_intervals = []
for m in re.finditer(r"setInterval\s*\((.{0,1800}?),\s*(\d{1,6})\s*\)", s, re.S):
    try:
        ms = int(m.group(2))
    except ValueError:
        continue
    if ms <= 500:
        line = s.count("\n", 0, m.start()) + 1
        fast_intervals.append({
            "line": line,
            "offset": m.start(),
            "ms": ms,
            "snippet": re.sub(r"\s+", " ", m.group(0)).strip()[:700],
        })

fast_intervals.sort(key=lambda x: (x["ms"], x["offset"]))

report = {
    "report_version": 1,
    "active_index": str(p.relative_to(ROOT)),
    "observer_count": len(rows),
    "top_observers": rows[:60],
    "fast_interval_count": len(fast_intervals),
    "fast_intervals": fast_intervals[:60],
}

Path("gh-observer-loop-report.json").write_text(
    json.dumps(report, ensure_ascii=False, indent=2),
    encoding="utf-8",
)

print(f"OBSERVER_COUNT={len(rows)}")
for i,row in enumerate(rows[:15], 1):
    print(
        f"OBSERVER#{i} score={row['score']} line={row['line']} "
        f"broad={row['broad_target']} subtree={row['subtree']} "
        f"childList={row['childList']} attrs={row['attributes']} "
        f"mutations={row['mutation_count']} raf={row['requestAnimationFrame']} "
        f"timeout={row['setTimeout']} interval={row['setInterval']}"
    )
    if i <= 8:
        print(f"OBSERVER_SNIPPET#{i}={row['snippet'][:650]}")

print(f"FAST_INTERVAL_COUNT={len(fast_intervals)}")
for i,row in enumerate(fast_intervals[:15], 1):
    print(f"FAST_INTERVAL#{i} ms={row['ms']} line={row['line']} snippet={row['snippet'][:500]}")

print("OBSERVER_LOOP_REPORT=PASS")
