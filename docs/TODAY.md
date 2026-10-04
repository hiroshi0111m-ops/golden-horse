# TODAY — 2026-10-05

## Single goal
Prove the currently published V166-based DEV can complete the real user core loop:

GUEST → confirm 1000G → place BET → exactly 7 horses → race start/run → GOAL → RESULT/payout → next race.

## Starting point
- Branch for RC work: `gh-rc-20261020`
- Baseline source: V166 reward/idempotency ledger
- Current public DEV: https://misty-horizon-1435.hosted.pageshare.ai/
- Published HTML body exact match with GitHub candidate: PASS
- Static ledger assertions: 13/13 PASS
- Runtime core loop: NOT_TESTED because the previous cloud browser timed out after title load.
- Do not infer a game defect from that tool timeout alone.

## PASS criteria
PASS only if all are observed in a real responsive browser or equivalent valid runtime:
1. HTTPS opens.
2. GUEST can start without member login.
3. guest balance is 1000G as specified.
4. BET screen is usable.
5. exactly 7 horses are present.
6. a legal 5/10/50/100G bet can be accepted and fixed.
7. race actually starts.
8. race reaches GOAL.
9. result/payout screen appears and ledger/balance behavior is consistent.
10. next race can be entered without breaking the session.

Record each item separately. Partial completion is PARTIAL, not PASS.

## If FAIL occurs
- Capture the first reproducible game-side error/evidence.
- Make only the smallest necessary RC fix.
- Do not redesign UI or add unrelated features.
- Re-run the complete core loop after the fix.
- Preserve the pre-fix rollback point.

## Do not work on today
- Square
- VR/metaverse
- new world tournaments
- mass horse/jockey content creation
- new gacha probability changes
- free chat
- ranking redesign
- seat reservation implementation
- eKYC provider integration
- speculative refactors

## GPS
GPS is in RC MASTER and remains mandatory scope. Do not implement it today unless it is directly blocking the core-loop runtime test.

## Required end report
CURRENT VERSION
CURRENT CP
PUBLIC URL
CHANGED
PASS
FAIL
NOT_TESTED
ROLLBACK
FIRST BLOCKER (if any)
NEXT ONE ACTION
