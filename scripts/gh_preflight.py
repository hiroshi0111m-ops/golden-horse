from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]

checks = [
    ("V166 immutable baseline", ROOT / "scripts" / "gh_immutable_v166.py"),
    ("Static guard", ROOT / "scripts" / "gh_guard.py"),
    ("Seven-step static contract", ROOT / "scripts" / "gh_7step_contract.py"),
    ("Source bloat guard", ROOT / "scripts" / "gh_quality_report.py"),
    ("Checkpoint manifest", ROOT / "scripts" / "gh_checkpoint_manifest.py"),
]

for label, script in checks:
    print("=" * 64)
    print(label)
    print("=" * 64)
    result = subprocess.run([sys.executable, str(script)], cwd=ROOT)
    if result.returncode != 0:
        print(f"PREFLIGHT=FAIL at {label}")
        sys.exit(result.returncode)

print("=" * 64)
print("GOLDEN_HORSE_PREFLIGHT=PASS")
