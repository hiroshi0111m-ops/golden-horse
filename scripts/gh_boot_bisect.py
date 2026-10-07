from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "checkpoints" / "V166_REWARD_IDEMPOTENCY_LEDGER" / "index.html"
OUT = ROOT / "bisect_variants"

html = SRC.read_text(encoding="utf-8")
scripts = list(re.finditer(r"<script\b[^>]*>.*?</script>", html, re.I | re.S))
count = len(scripts)

VARIANTS = {
    "baseline": [],
    "disable_core_1": [(1, 1)],
    "keep_core_only": [(2, count)],
    "disable_2_100": [(2, min(100, count))],
    "disable_101_200": [(101, count)],
    "disable_2_50": [(2, min(50, count))],
    "disable_51_100": [(51, min(100, count))],
    "disable_101_150": [(101, min(150, count))],
    "disable_151_200": [(151, count)],
}

def disabled(index, ranges):
    return any(a <= index <= b for a,b in ranges)

def make_variant(ranges):
    pieces=[]
    last=0
    for i,m in enumerate(scripts,1):
        pieces.append(html[last:m.start()])
        block=m.group(0)
        if disabled(i,ranges):
            open_end=block.find(">")
            if open_end >= 0:
                opening=block[:open_end]
                rest=block[open_end:]
                if re.search(r"\btype\s*=", opening, re.I):
                    opening=re.sub(r"\btype\s*=\s*([\"']).*?\1", 'type="text/plain"', opening, count=1, flags=re.I|re.S)
                else:
                    opening += ' type="text/plain"'
                opening += f' data-gh-bisect-disabled="{i}"'
                block=opening+rest
        pieces.append(block)
        last=m.end()
    pieces.append(html[last:])
    return "".join(pieces)

OUT.mkdir(exist_ok=True)
manifest={"script_count":count,"variants":{}}
for name,ranges in VARIANTS.items():
    d=OUT/name
    d.mkdir(parents=True,exist_ok=True)
    text=make_variant(ranges)
    (d/"index.html").write_text(text,encoding="utf-8")
    disabled_count=sum(1 for i in range(1,count+1) if disabled(i,ranges))
    manifest["variants"][name]={"ranges":ranges,"disabled_count":disabled_count,"size_bytes":len(text.encode("utf-8"))}
    print(f"BISECT_VARIANT={name} disabled={disabled_count} ranges={ranges}")

(OUT/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding="utf-8")
print(f"BISECT_SCRIPT_COUNT={count}")
print("BOOT_BISECT_GENERATE=PASS")
