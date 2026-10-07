from pathlib import Path
import json
import re

ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/"checkpoints"/"V166_REWARD_IDEMPOTENCY_LEDGER"/"index.html"
s=SRC.read_text(encoding="utf-8",errors="replace")

rows=[]
for idx,m in enumerate(re.finditer(r"<script\b(?P<attrs>[^>]*)>(?P<body>.*?)</script>",s,re.I|re.S),1):
    attrs=m.group("attrs")
    body=m.group("body")
    im=re.search(r"\bid\s*=\s*([\"'])(.*?)\1",attrs,re.I|re.S)
    sid=im.group(2) if im else None
    line=s.count("\n",0,m.start())+1
    head=re.sub(r"\s+"," ",body[:500]).strip()
    rows.append({"index":idx,"id":sid,"line":line,"chars":len(body),"head":head})

targets=[r for r in rows if 80<=r["index"]<=105 or 135<=r["index"]<=150]
Path("gh-script-index-map.json").write_text(
    json.dumps({"targets":targets},ensure_ascii=False,indent=2),encoding="utf-8"
)

for r in targets:
    print(f"SCRIPT_INDEX={r['index']} id={r['id']} line={r['line']} chars={r['chars']} head={r['head'][:330]}")
print("SCRIPT_INDEX_MAP=PASS")
