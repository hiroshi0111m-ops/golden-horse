# RUN3 reload cause

The prior public three-run sequence failed at RUN2 step 8. RUN3 required a reload to clear that stalled session. REPRODUCTION.md and the saved run2 records are the baseline.

An instrumented, isolated copy of public Version31 reproduced the cause without game state manipulation: first finishAndReturn completed at 2026-10-05T03:07:17.950Z. A subsequent natural race reached RESULT, then finishAndReturn was called at 03:11:45.509Z with running=true, settled=true, transitioning=true; its duplicate-transition guard returned before closing the race or starting the next BET countdown. No transition error was logged.

The active overriding startRace (near line2541) omitted the per-race transition latch/button reset present in the earlier definition. makeRacePlan resets settled but never transitioning. Reload recreates transitioning=false, explaining RUN3 recovery. This is a reproducible game defect, not a browser/tool defect.

Minimal fix: after the running guard and before beginning a new race, set raceState.transitioning=false, enable resultNext and restore its label. Preserve the one-transition-per-race guard. No settlement, odds, guest balance, horse count or unrelated feature changes.

Regression test executes the actual shipped overriding startRace and finishAndReturn in a controlled Node VM. Version31 fails RUN2; candidate passes three successive transitions while duplicate callbacks remain rejected. All 201 inline scripts parse. These are supporting tests, not public runtime PASS evidence.

Rollback retains public Version31 and RC commit7a0e0332564b9765e2f8173cc5890ae81a9c3d0e, plus the existing Version28 rollback. Public three-run verification after deployment is required before CORE LOOP PASS.
