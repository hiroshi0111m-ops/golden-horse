from pathlib import Path
import hashlib
import json
import re
from datetime import datetime, timezone

ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/"checkpoints"/"V166_REWARD_IDEMPOTENCY_LEDGER"/"index.html"
OUT_DIR=ROOT/"checkpoints"/"V168_BOOT_LOOP_FIX"
OUT=OUT_DIR/"index.html"
META=OUT_DIR/"CP_V168_BOOT_LOOP_FIX.json"

EXPECTED_SHA="0de728faaaa8a7f9b5e726bd0d014972128f44fa049714636ff8820c513fcfe9"

raw=SRC.read_bytes()
src_sha=hashlib.sha256(raw).hexdigest()
if src_sha!=EXPECTED_SHA:
    raise SystemExit(f"V166 checksum mismatch: {src_sha}")

html=raw.decode("utf-8")
changes=[]

def patch_script(script_id, transform):
    global html
    pattern=re.compile(
        rf'(<script\b(?=[^>]*\bid=(["\']){re.escape(script_id)}\2)[^>]*>)(.*?)(</script>)',
        re.I|re.S,
    )
    m=pattern.search(html)
    if not m:
        raise SystemExit(f"script not found: {script_id}")
    body=m.group(3)
    new_body,detail=transform(body)
    if new_body==body:
        raise SystemExit(f"no change produced for {script_id}")
    html=html[:m.start(3)]+new_body+html[m.end(3):]
    changes.append({"script_id":script_id,**detail})

def fix_v106(body):
    old="if(!race.classList.contains('on')){race.classList.remove('gh-v106-straight','gh-v106-finish');return;}"
    new="""if(!race.classList.contains('on')){
      const stale=['gh-v106-straight','gh-v106-finish'].filter(c=>race.classList.contains(c));
      if(stale.length)race.classList.remove(...stale);
      return;
    }"""
    if body.count(old)!=1:
        raise SystemExit(f"V106 expected pattern count={body.count(old)}")
    return body.replace(old,new,1),{
        "problem":"MutationObserver watched race.class while inactive tick always called classList.remove on the same watched attribute.",
        "fix":"Only remove V106 classes when at least one is actually present, breaking the observer feedback loop.",
    }

def fix_v116(body):
    old="if(!race.classList.contains('on')){race.classList.remove('ghCamStart','ghCamCorner','ghCamStretch','ghCamFinish');lastPhase='';return}"
    new="""if(!race.classList.contains('on')){
      const stale=['ghCamStart','ghCamCorner','ghCamStretch','ghCamFinish'].filter(c=>race.classList.contains(c));
      if(stale.length)race.classList.remove(...stale);
      lastPhase='';
      return
    }"""
    if body.count(old)!=1:
        raise SystemExit(f"V116 expected pattern count={body.count(old)}")
    return body.replace(old,new,1),{
        "problem":"MutationObserver watched race.class while inactive apply always removed cinema classes from the same watched attribute.",
        "fix":"Only remove cinema classes when they are actually present, breaking the observer feedback loop.",
    }

def fix_v123(body):
    old="if(t)e.textContent=t;"
    new="if(t&&t!==e.textContent)e.textContent=t;"
    if body.count(old)!=1:
        raise SystemExit(f"V123 expected pattern count={body.count(old)}")
    return body.replace(old,new,1),{
        "problem":"MutationObserver watched raceVenue text and clean always reassigned textContent, retriggering itself.",
        "fix":"Only assign textContent when the cleaned text differs from the current value.",
    }

patch_script("gh-v106-auto-retreat-script",fix_v106)
patch_script("gh-v116-cinema-audio-script",fix_v116)
patch_script("gh-v123-venue-label-cleanup",fix_v123)

marker='<meta name="gh-build-candidate" content="V168-BOOT-LOOP-FIX">'
if marker not in html:
    html=html.replace("</head>",marker+"\n</head>",1)

OUT_DIR.mkdir(parents=True,exist_ok=True)
OUT.write_text(html,encoding="utf-8")
out_bytes=OUT.read_bytes()

meta={
    "checkpoint":"V168-BOOT-LOOP-FIX",
    "created_utc":datetime.now(timezone.utc).isoformat(),
    "source":{
        "path":str(SRC.relative_to(ROOT)),
        "sha256":src_sha,
        "size_bytes":len(raw),
    },
    "output":{
        "path":str(OUT.relative_to(ROOT)),
        "sha256":hashlib.sha256(out_bytes).hexdigest(),
        "size_bytes":len(out_bytes),
    },
    "changes":changes,
    "diagnostic_evidence":{
        "boot_bisect_individual_failures":[
            {"script_index":91,"id":"gh-v106-auto-retreat-script"},
            {"script_index":100,"id":"gh-v116-cinema-audio-script"},
            {"script_index":143,"id":"gh-v123-venue-label-cleanup"},
        ],
        "note":"Each listed script independently made core+single-script boot non-responsive in Chrome; neighboring single-script variants passed."
    },
    "rollback":"Use immutable V166_REWARD_IDEMPOTENCY_LEDGER.",
}

META.write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding="utf-8")
print(f"V168_OUTPUT={OUT.relative_to(ROOT)}")
print(f"V168_SIZE={len(out_bytes)}")
print(f"V168_SHA256={meta['output']['sha256']}")
for ch in changes:
    print("V168_CHANGE="+json.dumps(ch,ensure_ascii=False))
print("CREATE_V168_BOOT_LOOP_FIX=PASS")
