from pathlib import Path
import hashlib
import sys

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "checkpoints" / "V166_REWARD_IDEMPOTENCY_LEDGER" / "index.html"
EXPECTED_SIZE = 2071318
EXPECTED_SHA256 = "0de728faaaa8a7f9b5e726bd0d014972128f44fa049714636ff8820c513fcfe9"

if not TARGET.exists():
    print("FAIL: V166 baseline file missing")
    sys.exit(1)

data = TARGET.read_bytes()
size = len(data)
sha = hashlib.sha256(data).hexdigest()

print(f"V166_BASELINE_SIZE={size}")
print(f"V166_BASELINE_SHA256={sha}")

if size != EXPECTED_SIZE:
    print(f"FAIL: V166 baseline size changed expected={EXPECTED_SIZE}")
    sys.exit(1)

if sha != EXPECTED_SHA256:
    print("FAIL: V166 baseline checksum changed")
    sys.exit(1)

print("V166_IMMUTABLE_BASELINE=PASS")
