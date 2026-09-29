# GOLDEN HORSE

This repository is the recovery/checkpoint store for GOLDEN HORSE.

## Recovery baseline

- Baseline: GoldenHorse_Friend_V147_20260930-0556JST
- Created: 2026-09-30 05:56 JST
- ZIP SHA-256: 10e2a04f9d281c77e9ecbad212fa970a2879b57db6e0a064d2a8d008a016aca5
- index.html SHA-256: 872d8a895377fdd7b958150d00077d48d715b49af994f2f51d8f1b4b2d81b272
- V146 rollback SHA-256: 317a7449286d4dceb8ced533f296f218e4ec9aea8bd6084c77d045497649d2eb
- V147 guest distribution contract: 11/11 PASS
- Inline scripts: 181 / syntax failures: 0
- Browser execution: not yet verified in this environment
- Production: unchanged
- Existing Netlify production must not be overwritten without explicit verification.

## Fixed product invariants

- 7 horses
- BET 120 seconds
- BET skip
- fixed odds
- race about 30–40 seconds
- result about 7 seconds
- photo finish
- final 10 second countdown
- fanfare complete -> ~0.7s silence -> start
- commentary synchronized with race events
- preserve security and normal behavior
- black/gold premium arcade-racing direction

## Workflow

Work/available execution path -> test -> checkpoint -> GitHub -> test deployment URL -> mobile verification.
If one external route fails twice, record the cause and switch route.
