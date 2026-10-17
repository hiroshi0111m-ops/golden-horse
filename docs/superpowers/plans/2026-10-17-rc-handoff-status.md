# RC Handoff Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add one canonical, machine-checkable status file so another Codex can resume the V174 RC mainline without confusing old versions, PASS evidence, RED blockers, or rollback points.

**Architecture:** A Markdown status file remains human-readable while fixed `KEY: value` records provide a stable contract. A Python validator checks required fields, exact 40-character commit identifiers, PASS/RED/NOT_TESTED sections, and a single next action. GitHub Actions runs the validator without touching product code.

**Tech Stack:** Markdown, Python 3.12, GitHub Actions.

**Spec:** `AGENTS.md` plus the user-locked 2026/10/20 RC instructions.

## Global Constraints

- Product HTML, race logic, balances, odds, Square, members, and the G ledger remain unchanged.
- Main merge, production deployment, and paid services remain prohibited.
- Current safe product baseline is V174; V173 is the version rollback.
- Known RED and NOT TESTED items must never be reported as PASS.

## Review Focus

- A stale V166/V169 reference must not be presented as current.
- PR #19 intentional RED must remain visible.
- Emulation must not be presented as physical-device evidence.
- Current and rollback commit IDs must be complete 40-character SHA-1 strings.
- Exactly one next action must be clear enough for another agent to execute.

---

### Task 1: Canonical status contract

**Files:**
- Create: `scripts/gh_free_automation_status_contract.py`
- Create: `.github/workflows/rc-handoff-status.yml`
- Create after RED: `FREE_AUTOMATION_STATUS.md`

- [ ] Write the validator first and run it while `FREE_AUTOMATION_STATUS.md` is absent.
- [ ] Verify RED reports `missing FREE_AUTOMATION_STATUS.md`.
- [ ] Add the minimum accurate status file for V174, V173 rollback, existing PASS/RED/NOT_TESTED evidence, and the next action.
- [ ] Rerun the same workflow and verify GREEN.
- [ ] Open a draft PR stacked on `automation/v174-restore-drill` and record the run URLs.
