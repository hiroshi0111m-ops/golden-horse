# GOLDEN HORSE — RC MASTER 2026-10-20

## Authority
This document is the active source of truth for the GOLDEN HORSE RC line. Historical V147–V166 notes remain rollback/evidence only. Do not let old instructions override this file.

## Current baseline
- RC branch: `gh-rc-20261020`
- Source branch: `v166-reward-idempotency-ledger-dev`
- Source commit: `089456c9659fdadf47c8ead5124bd26d986a4c0f`
- Current checkpoint: `CP_V166_PUBLISHED_PUBLIC_BODY_VERIFIED_RUNTIME_TOOL_BLOCKED`
- DEV URL: https://misty-horizon-1435.hosted.pageshare.ai/
- Published body exact-match verification: PASS
- V166 static ledger assertions: 13/13 PASS
- Real runtime GUEST→1000G→BET→7 horses→GOAL→RESULT→next race: NOT_TESTED
- Immediate PageShare rollback target: Version 28
- ShipStatic: BLOCKED_AUTH_NO_RETRY
- Production / real member data / Supabase production: unchanged

## 2026-10-20 RC definition
The RC must let a real user register, be verified, play the game, use OWNER systems, use friend/trade features, enter the free sweepstakes route, reserve a seat, receive a QR, and let staff/admin audit the full flow.

This is not a mockup target. Core flows must be executable and server-authoritative.

## Navigation
Keep exactly five primary tabs:
1. ホーム
2. レース
3. 育成
4. 特典
5. マイページ

Deep functionality belongs in child pages. Do not add more primary tabs.

## BET race core
- Exactly 7 horses.
- BET window 120 seconds; skip supported; final 10-second countdown.
- Fanfare completes, then about 0.7 seconds silence, then start.
- Race target about 30–40 seconds; result about 7 seconds.
- Ticket types: 単勝 / 複勝 / 馬連 / ワイド / 3連複 / 3連単.
- Stakes: 5G / 10G / 50G / 100G; max 100G.
- Fixed odds at acceptance.
- Race engine and odds/payout engine are separate.
- Payout rate is an admin-only internal setting. Never display it and never let users choose it.
- Once betting is accepted for a race, that race's odds/payout configuration is locked.
- Outcome must not be altered afterward to chase a payout target.
- Server ledger is authoritative for BET and G settlement.

## Pools
Keep separate data domains:
- RACE_POOL: normal BET horses only.
- OWNER_POOL: gacha/owned horses and jockeys.
- LEGEND_POOL: tournament NPCs.
Normal BET horses must not be the same cards as OWNER gacha horses.

## OWNER
OWNER is separate from normal BET outcomes.
Use owned horse + owned jockey + equipment + skills + compatibility + strategy.
Include:
- 厩舎
- GDBトレセン
- 編成
- 調教 / 稽古
- 戦績 / 騎乗成績
- 殿堂馬 / 名騎手 / 名コンビ
- OWNER race
- national progression → Japan → world structure

## Account level and training
Use GOLDEN Lv as account progression, separate from horse/jockey level.
Playing races/events grants account EXP. Level progression grants 馬育成Pt / 騎手養成Pt.

Horse training G costs currently:
- 軽め 1G
- スピード 3G
- スタミナ 3G
- ゲート 3G
- 坂路 4G
- 特別調教 5G

Training also consumes the appropriate training points and time-recovery charge. Do not allow unlimited instant training from G alone.

## Gacha and rarity
Horse and jockey both use:
N / R / SR / UR / スペシャルレア / スペシャルアート

Current strict probability candidate:
- N 78.50%
- R 16.00%
- SR 4.50%
- UR 0.80%
- スペシャルレア 0.17%
- スペシャルアート 0.03%

Current candidate prices:
- horse 5G
- jockey 5G
- equipment 3G
- 10 horse/jockey draws 50G

Do not silently change probabilities or prices. They require an explicit spec update before implementation.

Limit break requires:
- same rarity
- same CARD_ID
No cross-rarity or alternate-version limit break.

## Card exchange to G
Only surplus cards are eligible. First-owned copy should be protected/locked by default.
Current candidate exchange table:
- N: 100 cards → 1G
- R: 30 → 3G
- SR: 20 → 5G
- UR: 10 → 10G
- スペシャルレア: 2 → 20G
- スペシャルアート: 1 surplus copy → 50G

## Friends and trade
- Formal verified members only.
- No gift feature.
- No G transfer.
- No one-way card transfer.
- Trade is 1 card ↔ 1 card.
- Same rarity AND same category only.
  - UR horse ↔ UR horse: allowed.
  - UR jockey ↔ UR jockey: allowed.
  - UR horse ↔ SR horse: denied.
  - UR horse ↔ UR jockey: denied.
- Prefer untrained/unregistered cards as tradeable; trained/recorded/hall-of-fame assets are locked.
- Require audit history, double confirmation, confirmation reset if either side changes the offer, rate limits, and anti-abuse checks.
- Start with preset messages/stickers rather than unrestricted chat.

## Registration / identity
Target flow:
phone → SMS → provisional member number → initial password → recovery email → identity submission/review → formal member → GDB ID.

Design identity verification behind an adapter so manual admin verification can operate first and external eKYC can replace it later.
Use one internal unique member/GDB identity. Avoid using raw identity-document numbers as the application's primary ID.
Duplicate phone / LINE / recovery email rules must be enforced according to the approved member policy.

## GPS / in-store restriction
GPS is mandatory RC scope.
- Admin can turn GPS enforcement ON/OFF.
- Admin can configure prohibited radius (example policy: 50m).
- When enforcement is ON, normal game play/BET inside the store or prohibited radius must be rejected server-side.
- Seat reservation, QR, payment-status pages, check-in, extension and staff-required store functions remain accessible as needed.
- Location spoofing indicators, inconsistent device/location signals and repeated suspicious attempts are audit/risk events.
- Do not rely only on client-side hiding.

## Seat reservation and store-payment G reward
Seat flow:
store → seat → time → reservation → payment status → QR → check-in → extension if any → exit confirmation.

Square itself is a separate development track. Do not implement Square in this RC branch.
Keep adapter fields:
- payment_provider
- external_payment_id
- payment_status
- paid_at
- refund_status

Store/seat payments can award promotional G.
Required rule:
payment/reservation alone does NOT immediately mint G.
Server confirms actual visit/use and exit. When GPS enforcement is ON, the member must also be verified outside the configured prohibited radius before reward finalization. Reward is then finalized after the configured post-exit delay (target around 10 minutes).
No reward for cancellation, refund or non-use.
Tie reservation ID + external payment ID + member ID + reward ledger entry together and make reward issuance idempotent.
Admin controls the reward-G amount/rule.
Do not allow the store-payment reward path to become the required route for open-sweepstakes eligibility.

## Sweepstake / prize route
Keep a genuinely free route that does not require purchase or store visit.
Track:
- available campaigns
- entries
- draw
- winners
- shipping/fulfilment state
Keep paid/store activity separated from required entry eligibility.

## Rankings
Use weekly + monthly seasons, with optional special event windows.
BET categories include:
- 予想王 / BET SCORE
- 的中王
- 大穴王
- 連勝王
- G獲得王 (reference category; avoid making it the main skill ranking)
Consider one RANKING PICK per race to prevent brute-force entry volume from dominating.

OWNER ranking is separate: OWNER score, wins, win rate, conquest, GDB events, Japan/world results, hall-of-fame achievements.

## Admin/security
Required:
- member search/status
- identity approval
- G ledger
- BET ledger
- payout setting (admin only)
- gacha records
- sweepstakes entries/draw/winners/fulfilment
- referral records
- trade records
- reservations/QR/payment status/reward-G status
- login history
- admin-operation history
- anti-fraud flags and account suspension
- audit log
- day/month/lifetime aggregates
- idempotency for financial/reward actions
- server-authoritative state

Security target is not “fraud is mathematically impossible.” Target:
hard to abuse, detectable, stoppable, traceable, recoverable.

## UI rules
- 320 / 390 / 430px smartphone widths.
- Premium black + metallic gold; do not downgrade visual density into a simple mockup.
- Main actions within roughly 2 taps; deeper detail roughly 3.
- Contextual ? help on difficult terms.
- Short skippable first-use explanation.
- Locked features show exact unlock reason/progress.
- Multiple entrances may route to one canonical page; do not duplicate implementation.

## Schedule
- 10/05: GUEST → 1000G → BET → 7 horses → RESULT → next race
- 10/06: G/BET server ledger foundation
- 10/07: phone/SMS/provisional member/PW/email
- 10/08: identity/manual verification/GDB ID
- 10/09: admin/roles/audit/anti-abuse/GPS foundation
- 10/10: horse/jockey/equipment gacha + limit break
- 10/11: stable/training center/training
- 10/12: OWNER/formation/records/hall of fame
- 10/13: weekly/monthly rankings
- 10/14: referral/friends/trade
- 10/15: free-entry sweepstakes flow
- 10/16: seat reservation/QR/store-payment adapter/reward-G flow
- 10/17: integration RC1; freeze new feature scope
- 10/18: Android/LINE QA
- 10/19: iPhone/Safari/security/network/idempotency/recovery QA
- 10/20: RC2, backups, rollback and release-candidate evidence

If the work finishes earlier, move immediately into QA. Do not wait for 10/20.

## Explicitly deferred beyond RC unless needed for architecture
- VR
- metaverse
- full global region rollout
- bespoke animation for every horse/jockey
- unrestricted free chat
- full international payment expansion
- new speculative features not listed above

## Development discipline
Every change:
1. identify CURRENT VERSION / CURRENT CP
2. preserve rollback
3. make the smallest diff
4. static checks
5. automated checks where available
6. browser/runtime validation
7. regression check
8. checkpoint/save
9. report evidence

Never call NOT_TESTED a PASS.
Do not delete historical rollback material merely because it is not active scope.
