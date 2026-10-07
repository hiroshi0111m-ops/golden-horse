from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]

def active_index():
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
s = p.read_text(encoding="utf-8", errors="replace")

checks = {
    "guest_entry_text": "ゲストでレースへ進む" in s or ("ゲスト" in s and "1,000G" in s),
    "guest_1000g": "1,000G" in s or "1000G" in s,
    "bet_button": 'id="betBtn"' in s or "id='betBtn'" in s,
    "race_screen": 'id="raceScreen"' in s or "id='raceScreen'" in s,
    "start_gate": 'id="startGate"' in s or "START GATE" in s,
    "goal_line": 'id="trackGoalLine"' in s or ">GOAL<" in s,
    "result_panel": 'id="finishPanel"' in s or "RESULT ゴール" in s,
    "result_7_seconds": "結果表示 7 秒" in s or "結果表示 7秒" in s,
    "next_race_button": 'id="resultNext"' in s or "次のレース準備へ" in s,
    "seven_horse_contract": bool(re.search(r"7頭|七頭", s)),
    "bet_120_contract": bool(re.search(r"BET\s*120秒|BET120秒", s, re.I)),
}

failed = []
print(f"ACTIVE_INDEX={p.relative_to(ROOT)}")
for name, ok in checks.items():
    print(f"{name}={'PASS' if ok else 'FAIL'}")
    if not ok:
        failed.append(name)

if failed:
    print("FAILED_7STEP_STATIC_CONTRACT=" + ",".join(failed))
    sys.exit(1)

print("SEVEN_STEP_STATIC_CONTRACT=PASS")
