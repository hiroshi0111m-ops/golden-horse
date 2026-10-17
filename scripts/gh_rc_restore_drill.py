from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "RC_RECOVERY_MANIFEST.json"
REPORT_PATH = ROOT / "gh-rc-restore-drill.json"


def fail(message: str) -> int:
    report = {
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "status": "FAIL",
        "error": message,
    }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"RESTORE_DRILL=FAIL {message}", file=sys.stderr)
    return 1


def require_entry(manifest: dict[str, Any], name: str) -> dict[str, str]:
    entry = manifest.get(name)
    if not isinstance(entry, dict):
        raise ValueError(f"missing object: {name}")
    required = ("version", "cp", "known_good_commit", "generator", "active_index", "sha256", "marker")
    missing = [key for key in required if not isinstance(entry.get(key), str) or not entry[key].strip()]
    if missing:
        raise ValueError(f"{name} missing fields: {', '.join(missing)}")
    return {key: str(entry[key]) for key in required}


def resolve_repo_file(relative: str) -> Path:
    candidate = (ROOT / relative).resolve()
    if not candidate.is_relative_to(ROOT) or not candidate.is_file():
        raise ValueError(f"invalid repository file: {relative}")
    return candidate


def generate_and_verify(name: str, entry: dict[str, str]) -> dict[str, Any]:
    generator = resolve_repo_file(entry["generator"])
    result = subprocess.run(
        [sys.executable, str(generator)],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=180,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"{name} generator failed rc={result.returncode}: "
            f"{result.stdout[-800:]} {result.stderr[-800:]}"
        )

    active_index = resolve_repo_file(entry["active_index"])
    data = active_index.read_bytes()
    actual_sha = hashlib.sha256(data).hexdigest()
    if actual_sha != entry["sha256"]:
        raise RuntimeError(f"{name} checksum mismatch expected={entry['sha256']} actual={actual_sha}")
    text = data.decode("utf-8")
    if entry["marker"] not in text:
        raise RuntimeError(f"{name} marker missing: {entry['marker']}")

    env = os.environ.copy()
    env["GH_ACTIVE_INDEX"] = entry["active_index"]
    preflight = subprocess.run(
        [sys.executable, str(ROOT / "scripts/gh_preflight.py")],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=180,
    )
    if preflight.returncode != 0:
        raise RuntimeError(
            f"{name} preflight failed rc={preflight.returncode}: "
            f"{preflight.stdout[-1200:]} {preflight.stderr[-1200:]}"
        )

    generated_manifest = ROOT / "gh-checkpoint-manifest.json"
    evidence_name = f"gh-checkpoint-manifest-{name}.json"
    evidence_path = ROOT / evidence_name
    if not generated_manifest.is_file():
        raise RuntimeError(f"{name} preflight did not create gh-checkpoint-manifest.json")
    evidence_path.write_bytes(generated_manifest.read_bytes())

    return {
        "version": entry["version"],
        "cp": entry["cp"],
        "known_good_commit": entry["known_good_commit"],
        "generator": entry["generator"],
        "active_index": entry["active_index"],
        "sha256": actual_sha,
        "size_bytes": len(data),
        "marker": entry["marker"],
        "preflight": "PASS",
        "checkpoint_manifest": evidence_name,
    }


def main() -> int:
    if not MANIFEST_PATH.is_file():
        return fail("missing RC_RECOVERY_MANIFEST.json")

    try:
        manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        if manifest.get("schema_version") != 1:
            raise ValueError("schema_version must be 1")
        current = require_entry(manifest, "current")
        rollback = require_entry(manifest, "rollback")
        current_result = generate_and_verify("current", current)
        rollback_result = generate_and_verify("rollback", rollback)
        if current_result["sha256"] == rollback_result["sha256"]:
            raise RuntimeError("current and rollback checkpoints are identical")
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired, json.JSONDecodeError) as exc:
        return fail(str(exc))

    report = {
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "status": "PASS",
        "schema_version": 1,
        "current": current_result,
        "rollback": rollback_result,
        "restore_sequence": [
            current_result["active_index"],
            rollback_result["active_index"],
        ],
    }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"CURRENT_RESTORE_SHA256={current_result['sha256']}")
    print(f"ROLLBACK_RESTORE_SHA256={rollback_result['sha256']}")
    print("RESTORE_DRILL=PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
