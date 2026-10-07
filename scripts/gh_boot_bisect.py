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
    "keep_core_only": [(2, count)],
    "keep_88": [(2, 87), (89, count)],
    "keep_89": [(2, 88), (90, count)],
    "keep_90": [(2, 89), (91, count)],
    "keep_91": [(2, 90), (92, count)],
    "keep_92": [(2, 91), (93, count)],
    "keep_93": [(2, 92), (94, count)],
    "keep_94": [(2, 93), (95, count)],
    "keep_95": [(2, 94), (96, count)],
    "keep_96": [(2, 95), (97, count)],
    "keep_97": [(2, 96), (98, count)],
    "keep_98": [(2, 97), (99, count)],
    "keep_99": [(2, 98), (100, count)],
    "keep_100": [(2, 99), (101, count)],
    "keep_138": [(2, 137), (139, count)],
    "keep_139": [(2, 138), (140, count)],
    "keep_140": [(2, 139), (141, count)],
    "keep_141": [(2, 140), (142, count)],
    "keep_142": [(2, 141), (143, count)],
    "keep_143": [(2, 142), (144, count)],
    "keep_144": [(2, 143), (145, count)],
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
