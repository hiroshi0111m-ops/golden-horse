from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]

def active_index():
    candidates=[]
    for p in ROOT.rglob("index.html"):
        if any(part in {".git","node_modules"} for part in p.parts):
            continue
        try:
            candidates.append((p.stat().st_size,p))
        except OSError:
            pass
    if not candidates:
        raise SystemExit("index.html not found")
    return max(candidates,key=lambda x:x[0])[1]

p=active_index()
s=p.read_text(encoding="utf-8",errors="replace")

rows=[]
for idx,m in enumerate(re.finditer(r"<script\b(?P<attrs>[^>]*)>(?P<body>.*?)</script>",s,re.I|re.S),1):
    attrs=m.group("attrs")
    body=m.group("body")
    def attr(name):
        a=re.search(rf"\b{name}\s*=\s*([\"'])(.*?)\1",attrs,re.I|re.S)
        return a.group(2) if a else None
    sid=attr("id")
    src=attr("src")
    start_line=s.count("\n",0,m.start())+1
    counts={
        "MutationObserver":len(re.findall(r"\bMutationObserver\b",body)),
        "setInterval":len(re.findall(r"\bsetInterval\s*\(",body)),
        "setTimeout":len(re.findall(r"\bsetTimeout\s*\(",body)),
        "requestAnimationFrame":len(re.findall(r"\brequestAnimationFrame\s*\(",body)),
        "addEventListener":len(re.findall(r"\.addEventListener\s*\(",body)),
        "innerHTML":len(re.findall(r"\.innerHTML\s*=",body)),
        "querySelectorAll":len(re.findall(r"\bquerySelectorAll\s*\(",body)),
    }
    score=(
        counts["MutationObserver"]*8+
        counts["setInterval"]*6+
        counts["requestAnimationFrame"]*4+
        counts["setTimeout"]*2+
        counts["addEventListener"]+
        counts["innerHTML"]*2+
        counts["querySelectorAll"]
    )
    keywords=[]
    low=(sid or "").lower()+" "+body[:1200].lower()
    for k in ["debug","audit","guard","recovery","visual","cinema","commentary","speech","diagnostic","flow","monitor","polish","enhance"]:
        if k in low:
            keywords.append(k)
    rows.append({
        "index":idx,
        "id":sid,
        "src":src,
        "start_line":start_line,
        "chars":len(body),
        "score":score,
        "counts":counts,
        "keywords":keywords,
        "head":re.sub(r"\s+"," ",body[:700]).strip(),
    })

rows.sort(key=lambda x:(-x["score"],x["start_line"]))
report={
    "report_version":1,
    "active_index":str(p.relative_to(ROOT)),
    "script_count":len(rows),
    "top_scripts":rows[:80],
}
Path("gh-script-complexity-report.json").write_text(
    json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8"
)

print(f"SCRIPT_COUNT={len(rows)}")
for i,row in enumerate(rows[:25],1):
    print(
        f"SCRIPT#{i} id={row['id']} line={row['start_line']} chars={row['chars']} "
        f"score={row['score']} counts={row['counts']} keywords={row['keywords']}"
    )
    if i<=10:
        print(f"SCRIPT_HEAD#{i}={row['head'][:600]}")
print("SCRIPT_COMPLEXITY_REPORT=PASS")
