from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
CP = ROOT / "checkpoints"

items = []
if CP.exists():
    for p in sorted(CP.rglob("*")):
        if not p.is_file():
            continue
        data = p.read_bytes()
        items.append({
            "path": str(p.relative_to(ROOT)),
            "size_bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
        })

report = {
    "created_utc": datetime.now(timezone.utc).isoformat(),
    "file_count": len(items),
    "total_bytes": sum(x["size_bytes"] for x in items),
    "files": items,
}

Path("gh-recovery-inventory.json").write_text(
    json.dumps(report, ensure_ascii=False, indent=2),
    encoding="utf-8",
)

print(f"RECOVERY_FILE_COUNT={report['file_count']}")
print(f"RECOVERY_TOTAL_BYTES={report['total_bytes']}")
print("RECOVERY_INVENTORY=PASS")
