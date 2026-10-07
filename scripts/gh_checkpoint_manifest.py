from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import os

ROOT = Path(__file__).resolve().parents[1]

def active_index():
    if os.environ.get("GH_ACTIVE_INDEX"):
        candidate = (ROOT / os.environ["GH_ACTIVE_INDEX"]).resolve()
        if not candidate.is_file() or not candidate.is_relative_to(ROOT):
            raise SystemExit("invalid GH_ACTIVE_INDEX")
        return candidate
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

p = active_index()
data = p.read_bytes()

manifest = {
    "created_utc": datetime.now(timezone.utc).isoformat(),
    "active_index": str(p.relative_to(ROOT)),
    "size_bytes": len(data),
    "sha256": hashlib.sha256(data).hexdigest(),
    "git_sha": os.environ.get("GITHUB_SHA"),
    "git_ref": os.environ.get("GITHUB_REF"),
    "git_ref_name": os.environ.get("GITHUB_REF_NAME"),
    "workflow": os.environ.get("GITHUB_WORKFLOW"),
    "run_id": os.environ.get("GITHUB_RUN_ID"),
    "run_number": os.environ.get("GITHUB_RUN_NUMBER"),
}

Path("gh-checkpoint-manifest.json").write_text(
    json.dumps(manifest, ensure_ascii=False, indent=2),
    encoding="utf-8",
)

for k, v in manifest.items():
    print(f"{k}={v}")
print("CHECKPOINT_MANIFEST=PASS")
