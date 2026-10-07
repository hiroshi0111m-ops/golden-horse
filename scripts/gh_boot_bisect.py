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

    # Keep core + one quarter. These identify which script ranges can
    # independently make boot non-responsive.
    "keep_2_50": [(51, count)],
    "keep_51_100": [(2, 50), (101, count)],
    "keep_101_150": [(2, 100), (151, count)],
    "keep_151_200": [(2, 150)],

    # Keep core + smaller eighths for immediate second-stage isolation.
    "keep_2_25": [(26, count)],
    "keep_26_50": [(2, 25), (51, count)],
    "keep_51_75": [(2, 50), (76, count)],
    "keep_76_100": [(2, 75), (101, count)],
    "keep_101_125": [(2, 100), (126, count)],
    "keep_126_150": [(2, 125), (151, count)],
    "keep_151_175": [(2, 150), (176, count)],
    "keep_176_200": [(2, 175)],
    "keep_76_87": [(2, 75), (88, count)],
    "keep_88_100": [(2, 87), (101, count)],
    "keep_126_137": [(2, 125), (138, count)],
    "keep_138_150": [(2, 137), (151, count)],

    "keep_76_81": [(2, 75), (82, count)],
    "keep_82_87": [(2, 81), (88, count)],
    "keep_88_94": [(2, 87), (95, count)],
    "keep_95_100": [(2, 94), (101, count)],
    "keep_126_131": [(2, 125), (132, count)],
    "keep_132_137": [(2, 131), (138, count)],
    "keep_138_144": [(2, 137), (145, count)],
    "keep_145_150": [(2, 144), (151, count)],
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
