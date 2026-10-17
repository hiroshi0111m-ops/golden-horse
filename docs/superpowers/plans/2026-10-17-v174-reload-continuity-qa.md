# V174 Reload Continuity QA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prove that reloading V174 after BET acceptance and after settlement cannot lose Gold, duplicate a BET, duplicate history, or repeat a payout.

**Architecture:** A Playwright Android Chrome test uses one fresh browser context, confirms one 5G BET, reloads before the race, completes the race, reloads after settlement, and compares the exact in-memory state at each boundary. The workflow regenerates checksum-pinned V174 and runs mandatory preflight before the browser test.

**Tech Stack:** Node.js 22, Playwright Chromium, Python V174 generator/preflight, GitHub Actions.

**Spec:** `AGENTS.md`, `FREE_AUTOMATION_STATUS.md`, and the locked seven-step guest race flow.

## Global Constraints

- No product code change before a reproducible failing result and root-cause evidence.
- V174 checksum and V166 immutable baseline remain protected.
- Expected accepted-BET state after reload is exactly 995G, one active BET, zero history entries.
- Expected settled state after the second reload is unchanged Gold, zero active BETs, one history entry.
- Main, production, Square, members, and G ledger remain untouched.

## Review Focus

- Reload before race must not refund, lose, or duplicate the accepted BET.
- Reload after settlement must not repeat payout or history archival.
- Test must use a fresh browser context, not reused storage.
- One result must remain one history entry.
- Emulation evidence must not be called physical-device evidence.

---

### Task 1: Reload-continuity browser contract

**Files:**
- Create: `scripts/gh_reload_continuity_qa.mjs`
- Create: `.github/workflows/v174-reload-continuity-qa.yml`
- Update after result: `FREE_AUTOMATION_STATUS.md`

- [ ] Add the browser contract without changing product code.
- [ ] Run it against checksum-pinned V174 after mandatory preflight.
- [ ] If RED, preserve exact state snapshots and diagnose before proposing any fix.
- [ ] If GREEN, preserve the report and screenshots as artifacts.
- [ ] Save the result in a draft PR stacked on the canonical handoff-status branch.
