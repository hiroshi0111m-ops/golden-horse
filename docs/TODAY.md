# TODAY — 2026-10-06

## Single goal
Prove the currently published V166-based DEV can complete the real user core loop:

GUEST → confirm 1000G → place BET → exactly 7 horses → race start/run → GOAL → RESULT/payout → next race.

## Starting point
- Branch for RC work: `gh-rc-20261020`
- Baseline source: V166 reward/idempotency ledger
- Current public DEV: https://misty-horizon-1435.hosted.pageshare.ai/
- Published HTML body exact match with GitHub candidate: PASS
- Static ledger assertions: 13/13 PASS
- Current public: V169 / PageShare Version32.
- Runtime guest core loop: PASS after three consecutive complete real in-app-browser runs without reload on 2026-10-06.
- Current checkpoint: `CP_V169_PUBLIC_CORE_LOOP_3RUN_PASS`.
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

## Previous runtime evidence — 2026-10-05
- Published DEV: PageShare Version32, V169 core-loop transition reset.
- Source commit: `1b92690e950758069359a1605752f302c3585864`.
- Current validation checkpoint: `CP_V169_PUBLIC_CORE_LOOP_PARTIAL_BROWSER_CRASH`.
- CORE LOOP: NOT PASS. Three consecutive complete public runs have not been observed.
- Confirmed defect: the active overriding startRace retained the completed race's transition latch, blocking the second next-race transition. Reset only this latch and resultNext at each new race start.
- Public verification: RUN1 all eight steps PASS (race82→83, 1000G→930G→951G; payout21G). RUN2 GUEST/1000G PASS, remaining steps NOT_TESTED after browser crash. RUN3 NOT_TESTED.
- A fresh public-tab retry also crashed before GUEST. Chrome was unavailable. Crash origin remains unconfirmed; no speculative game fixes were added.
- Rollback: pre-fix Version31 retained; original public source and branch commit7a0e0332564b9765e2f8173cc5890ae81a9c3d0e retained in the V169 checkpoint. Existing Version28 rollback retained.
- Next one action: recover a responsive real browser and repeat GUEST→1000G→BET→7 horses→start→GOAL→RESULT→next race three consecutive times without reload.
- Scope remains this core loop only. RC MASTER, GPS/store-reward specs, production, member data and deferred features are unchanged.

## Latest runtime evidence — 2026-10-06
- Current CP: `CP_V169_PUBLIC_CORE_LOOP_3RUN_PASS`.
- CORE LOOP: PASS for the observed guest loop. Same public Version32, same in-app tab; no reload, crash or game stop across RUN1/RUN2/RUN3.
- Each run: GUEST → exactly1000G → accepted BET → exactly7 horses actually start → GOAL → official RESULT → click next-race button → select a horse and verify enabled BET action in next race.
- RUN1: all7 PASS; race72→73; 1000→990→990G; single horse1 10G; no hit.
- RUN2: all7 PASS; race73→74; 1000→930→970→1020G; seven singles10G each; payout40G plus existing first-clear50G.
- RUN3: all7 PASS; race74→75; 1000→990→1011G; single horse1 10G; payout21G.
- No game-source changes or republish. Existing source blob `74e79339f3544644c480576103dea00185cb5e58` and active Version32 rechecked after the runs. Only evidence/checkpoint/TODAY were saved.
- Previous human Edge next-button FAIL remains historical evidence. It was not reproduced here; its original cause is still unconfirmed. No speculative game fix.
- Evidence: `checkpoints/V169_PUBLIC_CORE_LOOP_3RUN_PASS/`; screenshots and DOM recordings retained locally with SHA256 manifest.
- Rollback: current public Version32, prior evidence commit `2e8a39724c636b9b93fc927bfd3f7d58e95f5fcc`, existing Version31/pre-fix commit and Version28 retained.
- Next one action: reproduce the previously reported Edge RESULT-button click conditions on the same public version. Do not advance to new features automatically.
- RC MASTER, GPS/store-reward specifications, production, real member data and deferred features are unchanged. Member/server/payment flows remain NOT_TESTED by these guest runs.
