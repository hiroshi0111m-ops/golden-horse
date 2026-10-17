# GOLDEN HORSE FREE AUTOMATION STATUS

STATUS_SCHEMA: 1
UPDATED_JST: 2026-10-18
CURRENT_VERSION: V174 FINAL FIVE TABS candidate
CURRENT_CP: CP_V174_TWO_TAB_CONCURRENT_BET_FLAKY_RED
CURRENT_BRANCH: automation/v174-two-tab-concurrent-bet-qa
CURRENT_COMMIT: 10cdb6ab22e58973299f085c4de70dff698d1918
CURRENT_PR: https://github.com/hiroshi0111m-ops/golden-horse/pull/31
ROLLBACK_VERSION: V173 MOBILE NAV SAFE AREA candidate
ROLLBACK_CP: CP_V173_MOBILE_NAV_SAFE_AREA_REGRESSION_PASS
ROLLBACK_COMMIT: 5d2a0fcb8f6b3aa996717e8d0d5d7f836f83219b
NEXT_ONE_ACTION: 2タブ精算競合で古い有効BETを復活させる保存キーと優先順位を特定し、V174原本を直接変更せず最小修正可否を判定する

## PASS

- GUEST 1,000G → 確認付き5G BET → 7頭発走 → OFFICIAL RESULT → 手動次レース120秒はAndroid Chromeエミュレーション、LINE疑似UA、iPhone WebKitでPASS。
- 同一セッション3レースは再読込0、page error 0、履歴0→1→2→3でPASS。
- 最終5タブ「ホーム / レース / 育成 / 特典 / マイページ」と390px安全領域はPASS。
- 同一BET確認の二重送信は5Gのみ控除、active BET 1件、履歴1件でPASS。
- BET確定後の再読込は995G、active BET 1件、履歴0件を維持してPASS。
- RESULT精算後の再読込は精算後G、active BET 0件、履歴1件を維持し、払戻と履歴の重複なしでPASS。
- V174→V173復旧は双方のSHA-256完全一致とmandatory preflightでPASS。
- 保存GをlocalStorage上で995Gから999,999Gへ改ざん後に再読込しても995G・active BET 1件へ復元され、クライアント保存値の改ざん受理なしでPASS。
- 保存状態を995G・active BET 1件から1000G・active BET 0件へ改ざん後に再読込しても995G・active BET 1件へ復元され、BET削除と5G返却の改ざん受理なしでPASS。
- RESULT精算後の保存状態を1103G・履歴1件から1108G・履歴0件へ改ざん後に再読込しても1103G・履歴1件へ復元され、精算履歴削除と5G返却の改ざん受理なしでPASS。
- 有効BET保存のstakeを5Gから100G、oddsを15.7から1570へ改ざん後に再読込してもstake 5G・odds 15.7・995G・active BET 1件へ復元され、払戻条件の保存値改ざん受理なしでPASS。
- 有効BET保存の単勝対象馬を1番から7番へ差し替え後に再読込しても1番・995G・active BET 1件へ復元され、対象馬の保存値改ざん受理なしでPASS。
- 5G BET確定後にBET前の完全なlocalStorage/sessionStorage保存状態を再投入して再読込しても995G・active BET 1件を維持し、旧保存状態によるBET巻き戻しなしでPASS。
- OFFICIAL RESULT精算後に精算前の有効BET保存状態を再投入して再読込しても995G・active BET 0件・履歴1件を維持し、BET復活・履歴消失・二重精算の入口なしでPASS。
- レース1精算後995Gの保存状態を、レース2の5G BET受理後に再投入して再読込しても990G・active BET 1件・履歴1件を維持し、旧精算済み状態による新規BET消失・5G返却なしでPASS。

## RED

- 通信断BETはオフライン確認操作後も1000Gから995Gへ減り、active BET 1件としてクライアント内で受理される。
- 権威BETサーバー、API、DBスキーマ、冪等受付、監査ログの実装先はこのリポジトリ内に存在しない。
- PR #19は上記を隠さず保持する意図的RED証拠であり、PASSへ読み替えない。
- 同一ゲスト状態を複製した2タブから同時に5G BET確認後、run 39052004832ではタブA精算後もタブB再読込が995G・active BET 1件・履歴なしを復活、run 39052226802では同手順PASSとなった。結果が実行順で分岐する精算競合のためFLAKY RED（PR #31）。

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
- クライアント保存G改ざん拒否GREEN: https://github.com/hiroshi0111m-ops/golden-horse/pull/23
- 保存BET削除・5G返却改ざん拒否GREEN: https://github.com/hiroshi0111m-ops/golden-horse/pull/24
- 精算履歴削除・5G返却改ざん拒否GREEN: https://github.com/hiroshi0111m-ops/golden-horse/pull/25
- 有効BET払戻条件改ざん拒否GREEN: https://github.com/hiroshi0111m-ops/golden-horse/pull/26
- 有効BET対象馬改ざん拒否GREEN: https://github.com/hiroshi0111m-ops/golden-horse/pull/27
- 旧保存状態リプレイ拒否GREEN: https://github.com/hiroshi0111m-ops/golden-horse/pull/28
- 精算前保存状態リプレイ拒否GREEN: https://github.com/hiroshi0111m-ops/golden-horse/pull/29
- 精算後保存状態による後続BET巻き戻し拒否GREEN: https://github.com/hiroshi0111m-ops/golden-horse/pull/30
- 2タブ同時BET・精算競合RED: https://github.com/hiroshi0111m-ops/golden-horse/pull/31
