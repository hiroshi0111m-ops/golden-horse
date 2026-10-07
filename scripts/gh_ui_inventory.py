from pathlib import Path
from html import unescape
import json
import re

ROOT = Path(__file__).resolve().parents[1]


def find_active_index() -> Path:
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
    candidates.sort(reverse=True, key=lambda x: x[0])
    return candidates[0][1]


def clean_text(s: str) -> str:
    s = re.sub(r"<[^>]+>", " ", s)
    s = unescape(s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


index = find_active_index()
source = index.read_text(encoding="utf-8", errors="replace")

keywords = [
    "guest", "ゲスト", "bet", "result", "次レース", "次のレース",
    "1000", "1,000", "発走", "start", "goal", "ゴール", "race"
]

elements = []
pattern = re.compile(
    r"<(?P<tag>button|a|div|span|input)\b(?P<attrs>[^>]*)>(?P<body>.*?)</(?P=tag)>",
    re.I | re.S,
)

for m in pattern.finditer(source):
    text = clean_text(m.group("body"))
    attrs = m.group("attrs")
    hay = (text + " " + attrs).lower()
    if not any(k.lower() in hay for k in keywords):
        continue

    def attr(name):
        am = re.search(rf"\b{name}\s*=\s*([\"'])(.*?)\1", attrs, re.I | re.S)
        return unescape(am.group(2)) if am else None

    elements.append({
        "tag": m.group("tag").lower(),
        "text": text[:300],
        "id": attr("id"),
        "class": attr("class"),
        "name": attr("name"),
        "type": attr("type"),
        "onclick": attr("onclick"),
        "data_action": attr("data-action"),
        "offset": m.start(),
    })

# Also record raw keyword snippets, useful when UI is created by templates/scripts.
snippets = {}
for keyword in keywords:
    matches = []
    start = 0
    lowered = source.lower()
    needle = keyword.lower()
    while len(matches) < 12:
        i = lowered.find(needle, start)
        if i < 0:
            break
        s = clean_text(source[max(0, i - 250): min(len(source), i + 500)])
        matches.append({"offset": i, "snippet": s[:600]})
        start = i + max(1, len(needle))
    snippets[keyword] = matches

report = {
    "active_index": str(index.relative_to(ROOT)),
    "size_bytes": index.stat().st_size,
    "matched_elements": elements[:500],
    "keyword_snippets": snippets,
}

Path("gh-ui-inventory.json").write_text(
    json.dumps(report, ensure_ascii=False, indent=2),
    encoding="utf-8"
)

print(f"ACTIVE_INDEX={report['active_index']}")
print(f"MATCHED_ELEMENTS={len(elements)}")
for e in elements[:80]:
    print(json.dumps(e, ensure_ascii=False))
print("UI_INVENTORY=PASS")
