from pathlib import Path
import hashlib
import json
import re
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "checkpoints" / "V166_REWARD_IDEMPOTENCY_LEDGER" / "index.html"
OUT_DIR = ROOT / "checkpoints" / "V167_BOOT_PERF"
OUT = OUT_DIR / "index.html"
META = OUT_DIR / "CP_V167_BOOT_PERF.json"

EXPECTED_SHA = "0de728faaaa8a7f9b5e726bd0d014972128f44fa049714636ff8820c513fcfe9"

if not SRC.exists():
    raise SystemExit("V166 source missing")

raw = SRC.read_bytes()
sha = hashlib.sha256(raw).hexdigest()
if sha != EXPECTED_SHA:
    raise SystemExit(f"V166 checksum mismatch: {sha}")

html = raw.decode("utf-8")

DEFER = {
    "gh-v8-resilience-cinema-script": 1200,
    "gh-v17-safe-hq-render-r1": 1200,
    "gh-v21-safe-visual-identity-r1": 1200,
    "gh-v112-commentary-engine": 1200,
    "gh-cinema-race-presentation-js": 1200,
    "gh-integrated21-cinema-script": 1800,
    "gh-v128-mobile-race-qa-script": 2500,
    "gh-v130-flow-qa-script": 2500,
    "gh-v140-unified-live-map-script": 2500,
    "gh-v144-script": 2500,
}

changes = []

for script_id, delay in DEFER.items():
    pattern = re.compile(
        rf'(<script\b(?=[^>]*\bid=(["\']){re.escape(script_id)}\2)[^>]*>)(.*?)(</script>)',
        re.I | re.S,
    )
    m = pattern.search(html)
    if not m:
        changes.append({"id": script_id, "status": "NOT_FOUND", "delay_ms": delay})
        continue

    body = m.group(3)
    if "V167_DEFERRED_BOOT" in body:
        changes.append({"id": script_id, "status": "ALREADY_WRAPPED", "delay_ms": delay})
        continue

    wrapped = f"""
/* V167_DEFERRED_BOOT:{script_id}:{delay}ms */
(()=>{{
  const __ghV167Run=()=>{{
    try{{
{body}
    }}catch(__ghV167Err){{
      console.error('[V167 deferred {script_id}]',__ghV167Err);
    }}
  }};
  const __ghV167Schedule=()=>setTimeout(__ghV167Run,{delay});
  if(document.readyState==='complete') __ghV167Schedule();
  else window.addEventListener('load',__ghV167Schedule,{{once:true}});
}})();
"""
    html = html[:m.start(3)] + wrapped + html[m.end(3):]
    changes.append({
        "id": script_id,
        "status": "DEFERRED",
        "delay_ms": delay,
        "original_chars": len(body),
    })

# Add build marker without touching the user-visible UI.
marker = '<meta name="gh-build-candidate" content="V167-BOOT-PERF">'
if marker not in html:
    if "</head>" in html:
        html = html.replace("</head>", marker + "\n</head>", 1)
    else:
        html = marker + "\n" + html

# Slow only clear QA/audit guard loops if their exact historical intervals exist.
interval_replacements = {
    "setInterval(audit,350)": "setInterval(audit,1200)",
    "setInterval(audit,400)": "setInterval(audit,1200)",
    "setInterval(tick,120)": "setInterval(tick,500)",
}
interval_changes = []
for old, new in interval_replacements.items():
    count = html.count(old)
    if count:
        html = html.replace(old, new)
    interval_changes.append({"from": old, "to": new, "count": count})

OUT_DIR.mkdir(parents=True, exist_ok=True)
OUT.write_text(html, encoding="utf-8")

out_bytes = OUT.read_bytes()
meta = {
    "checkpoint": "V167-BOOT-PERF",
    "created_utc": datetime.now(timezone.utc).isoformat(),
    "source": {
        "path": str(SRC.relative_to(ROOT)),
        "sha256": sha,
        "size_bytes": len(raw),
    },
    "output": {
        "path": str(OUT.relative_to(ROOT)),
        "sha256": hashlib.sha256(out_bytes).hexdigest(),
        "size_bytes": len(out_bytes),
    },
    "changes": changes,
    "interval_changes": interval_changes,
    "intent": "Reduce boot-time observer/timer pressure without changing core race, BET, payout, membership, or saved V166 source.",
    "rollback": "Use V166_REWARD_IDEMPOTENCY_LEDGER unchanged.",
}
META.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

missing = [x["id"] for x in changes if x["status"] == "NOT_FOUND"]
print(f"V167_OUTPUT={OUT.relative_to(ROOT)}")
print(f"V167_SIZE={len(out_bytes)}")
print(f"V167_SHA256={meta['output']['sha256']}")
print(f"DEFERRED_COUNT={sum(1 for x in changes if x['status']=='DEFERRED')}")
for x in changes:
    print(json.dumps(x, ensure_ascii=False))
for x in interval_changes:
    print("INTERVAL_CHANGE=" + json.dumps(x, ensure_ascii=False))
if missing:
    raise SystemExit("Expected script IDs missing: " + ",".join(missing))
print("CREATE_V167_BOOT_PERF=PASS")
