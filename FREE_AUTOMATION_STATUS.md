# GOLDEN HORSE FREE AUTOMATION STATUS

STATUS_SCHEMA: 1
UPDATED_JST: 2026-10-17
CURRENT_VERSION: V174 FINAL FIVE TABS candidate
CURRENT_CP: CP_V174_RELOAD_CONTINUITY_QA_PASS
CURRENT_BRANCH: automation/v174-reload-continuity-qa
CURRENT_COMMIT: 0bc48f0ffc4f7c430fc5a6a58963b7c09e22d0c7
CURRENT_PR: https://github.com/hiroshi0111m-ops/golden-horse/pull/22
ROLLBACK_VERSION: V173 MOBILE NAV SAFE AREA candidate
ROLLBACK_CP: CP_V173_MOBILE_NAV_SAFE_AREA_REGRESSION_PASS
ROLLBACK_COMMIT: 5d2a0fcb8f6b3aa996717e8d0d5d7f836f83219b
NEXT_ONE_ACTION: RUN_V174_PHONE_TEST_FREE.batで物理Androidのレース→5G BET→7頭→OFFICIAL RESULT→手動次レース120秒を撮影確認する

## PASS

- GUEST 1,000G → 確認付き5G BET → 7頭発走 → OFFICIAL RESULT → 手動次レース120秒はAndroid Chromeエミュレーション、LINE疑似UA、iPhone WebKitでPASS。
- 同一セッション3レースは再読込0、page error 0、履歴0→1→2→3でPASS。
- 最終5タブ「ホーム / レース / 育成 / 特典 / マイページ」と390px安全領域はPASS。
- 同一BET確認の二重送信は5Gのみ控除、active BET 1件、履歴1件でPASS。
- BET確定後の再読込は995G、active BET 1件、履歴0件を維持してPASS。
- RESULT精算後の再読込は精算後G、active BET 0件、履歴1件を維持し、払戻と履歴の重複なしでPASS。
- V174→V173復旧は双方のSHA-256完全一致とmandatory preflightでPASS。

## RED

- 通信断BETはオフライン確認操作後も1000Gから995Gへ減り、active BET 1件としてクライアント内で受理される。
- 権威BETサーバー、API、DBスキーマ、冪等受付、監査ログの実装先はこのリポジトリ内に存在しない。
- PR #19は上記を隠さず保持する意図的RED証拠であり、PASSへ読み替えない。

## NOT TESTED

- 物理AndroidでのV174完全フロー。
- 物理iPhoneでのV174完全フロー。
- 実LINE内ブラウザでのV174完全フロー。
- 実機音声同期。
- 本番相当のGPSサーバー拒否、正式会員、SMS、本人確認、GDB ID、支払い状態、退店後G付与。

## PROTECTED / DO NOT TOUCH

- main自動マージを行わない。
- 本番公開を行わない。
- Square本体を変更しない。
- 本番会員を変更しない。
- G台帳を変更しない。
- V166原本、V173 rollback、V174生成チェーンを上書きしない。

## Resume Notes

- V174生成: `python scripts/create_v174_final_tabs_fix.py`
- V174 active index: `GH_ACTIVE_INDEX=checkpoints/V174_FINAL_FIVE_TABS/index.html`
- 復旧検査: `python scripts/gh_rc_restore_drill.py`
- 静的preflight: `GH_ACTIVE_INDEX=checkpoints/V174_FINAL_FIVE_TABS/index.html python scripts/gh_preflight.py`
- 通信断RED: https://github.com/hiroshi0111m-ops/golden-horse/pull/19
- 復旧GREEN: https://github.com/hiroshi0111m-ops/golden-horse/pull/20
- 引き継ぎ固定: https://github.com/hiroshi0111m-ops/golden-horse/pull/21
- 再読込継続性GREEN: https://github.com/hiroshi0111m-ops/golden-horse/pull/22
