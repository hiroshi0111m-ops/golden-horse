#!/usr/bin/env python3
from pathlib import Path
import hashlib
import sys

V147_SHA256 = "872d8a895377fdd7b958150d00077d48d715b49af994f2f51d8f1b4b2d81b272"
V148_SHA256 = "a6da3925e6f843d4e70b5dc3760d75781b0452861a8ea922e986503b4f249711"

BLOCK = """<script id="gh-v148-source-id-integrity-r1">(()=>{'use strict';
const ids=[...document.querySelectorAll('[id]')].map(node=>node.id);
const duplicateIds=[...new Set(ids.filter((id,index)=>ids.indexOf(id)!==index))];
window.GH_V148=Object.freeze({version:'V148',scope:'source-level duplicate DOM id integrity',duplicateIdsAtBoot:duplicateIds,v147Preserved:!!window.GH_V147,productionUntouched:true,goldUntouched:true,memberDataUntouched:true,rollback:'index.V147-ROLLBACK.html'});
document.documentElement.dataset.ghVersion='V148';
})();</script>
"""

def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def main() -> int:
    if len(sys.argv) != 3:
        print("usage: build_v148_from_v147.py V147_INDEX_HTML OUTPUT_HTML", file=sys.stderr)
        return 2
    src = Path(sys.argv[1])
    out = Path(sys.argv[2])
    raw = src.read_bytes()
    got = sha256_bytes(raw)
    if got != V147_SHA256:
        raise SystemExit(f"Refusing unknown baseline: {got}")
    s = raw.decode("utf-8")
    old_style = '<style id="gh-v116-cinema-audio">'
    old_script = '<script id="gh-v116-cinema-audio">'
    if s.count(old_style) != 1 or s.count(old_script) != 1:
        raise SystemExit("V116 source ID precondition failed")
    s = s.replace(old_style, '<style id="gh-v116-cinema-audio-style">', 1)
    s = s.replace(old_script, '<script id="gh-v116-cinema-audio-script">', 1)
    if not s.endswith("\n"):
        s += "\n"
    s += BLOCK
    data = s.encode("utf-8")
    built = sha256_bytes(data)
    if built != V148_SHA256:
        raise SystemExit(f"V148 output hash mismatch: {built}")
    out.write_bytes(data)
    print(f"PASS {out} {built}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
