# GOLDEN HORSE AI development rules

This repository is an active GOLDEN HORSE development repository.

## Primary goal
Reach a store-operable RC quickly without rewriting working features.

## Locked core race flow
1. GUEST entry without login
2. Guest starting balance is exactly 1,000G
3. BET
4. Exactly 7 horses start
5. Race reaches GOAL
6. RESULT is shown
7. Next race transition works

A change that breaks any of the above is a regression.

## Locked gameplay basics
- 7 horses
- BET time: 120 seconds
- Countdown starts 10 seconds before close
- Race duration target: 30 to 40 seconds
- Result display target: about 7 seconds
- Fanfare -> 0.7 seconds silence -> START
- Bet types: Win, Place, Quinella, Wide, Trio, Trifecta
- Bet amounts: 5G / 10G / 50G / 100G
- Maximum bet: 100G
- Race progression: 600m -> 400m -> 200m -> final stretch -> GOAL -> PHOTO -> RESULT

## Development policy
- Preserve existing working UI and logic unless the task explicitly requests a change.
- Prefer the smallest safe patch.
- Never rewrite the whole application for a local bug.
- Never silently change payout behavior, membership rules, balances, or fixed gameplay specifications.
- Development and test changes must be made on a development branch first.
- Before considering a task complete, run the repository guard and runtime smoke test.
- If a test cannot actually be executed, report NOT TESTED. Never guess PASS.
- Do not claim a browser flow passed unless it was actually executed.
- Keep checkpoints intact. Do not overwrite historical checkpoint files unless explicitly instructed.
- When adding a new stable checkpoint, create a new versioned checkpoint instead of replacing an old one.

## Fast-fix order
1. Reproduce
2. Identify the smallest cause
3. Patch
4. Run guard
5. Run runtime smoke
6. Report changed files, test result, and remaining risk

## Current automation commands
- Static guard: `python scripts/gh_guard.py`
- Runtime smoke: `node scripts/gh_runtime_smoke.mjs`

## RC priority
Fix blockers to the 7-step guest race flow before adding optional features.
