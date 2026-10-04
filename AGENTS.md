# GOLDEN HORSE Codex instructions

This branch is the single active RC development line for the 2026-10-20 target.

Read these two files before changing code:
1. `docs/RC_MASTER.md` — permanent product/development constraints.
2. `docs/TODAY.md` — the only active task for the current work cycle.

Rules:
- Older prompts, branches, checkpoint notes, and historical instructions are archive/reference only. Do not revive old scope unless RC_MASTER or TODAY explicitly requires it.
- Preserve the current working game and rollback points. Never simplify/rebuild the product from scratch.
- Do not modify production, real member data, real G balances, or Supabase production without explicit approval.
- Square implementation is a separate project. Keep only the payment adapter fields defined in RC_MASTER.
- Treat unverified behavior as NOT_TESTED, never PASS.
- Make the smallest safe diff, test it, record the checkpoint, and keep rollback possible.
- At the end report: CURRENT VERSION / CURRENT CP / CHANGED / PASS / FAIL / NOT_TESTED / ROLLBACK / NEXT ONE ACTION.
