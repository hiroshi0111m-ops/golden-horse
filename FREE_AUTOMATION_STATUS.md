# GOLDEN HORSE FREE AUTOMATION STATUS

STATUS_SCHEMA: 1
UPDATED_JST: 2026-10-18
CURRENT_VERSION: V176 LINE LIFECYCLE FIX candidate
CURRENT_CP: CP_V176_AUTHORITY_CONFORMANCE_READY_API_BLOCKED
CURRENT_BRANCH: automation/v176-authority-conformance
CURRENT_COMMIT: 9a0e28894ddbcf45693bab0dc458c8230ae0cd6f
CURRENT_PR: https://github.com/hiroshi0111m-ops/golden-horse/pull/38
ROLLBACK_VERSION: V173 MOBILE NAV SAFE AREA candidate
ROLLBACK_CP: CP_V173_MOBILE_NAV_SAFE_AREA_REGRESSION_PASS
ROLLBACK_COMMIT: 5d2a0fcb8f6b3aa996717e8d0d5d7f836f83219b
NEXT_ONE_ACTION: GOLDEN HORSE専用の隔離済みbackend/API実装先を確定し、GH_AUTHORITY_API_URLを設定してscripts/gh_authority_api_conformance.py --require-apiを実行する。明示的な専用先が確認できるまで既存の別名Supabase projectへ書き込まない

## PASS

- GUEST 1,000G → 確認付き5G BET → 7頭発走 → OFFICIAL RESULT → 手動次レース120秒はAndroid Chromeエミュレーション、LINE疑似UA、iPhone WebKitでPASS。
- 同一セッション3レースは再読込0、page error 0、履歴0→1→2→3でPASS。
- 最終5タブ「ホーム / レース / 育成 / 特典 / マイページ」と390px安全領域はPASS。
- 同一BET確認の二重送信は5Gのみ控除、active BET 1件、履歴1件でPASS。
- BET確定後の再読込は995G、active BET 1件、履歴0件を維持してPASS。
- RESULT精算後の再読込は精算後G、active BET 0件、履歴1件を維持し、払戻と履歴の重複なしでPASS。
- V174→V173復旧は双方のSHA-256完全一致とmandatory preflightでPASS。
- V174限定PASS（V176では回帰RED）: 保存GをlocalStorage上で995Gから999,999Gへ改ざん後に再読込しても995G・active BET 1件へ復元され、クライアント保存値の改ざん受理なしでPASS。
- V174限定PASS（V176では回帰RED）: 保存状態を995G・active BET 1件から1000G・active BET 0件へ改ざん後に再読込しても995G・active BET 1件へ復元され、BET削除と5G返却の改ざん受理なしでPASS。
- V174限定PASS（V176ではFLAKY RED）: RESULT精算後の保存状態を1103G・履歴1件から1108G・履歴0件へ改ざん後に再読込しても1103G・履歴1件へ復元され、精算履歴削除と5G返却の改ざん受理なしでPASS。
- V174限定PASS（V176では回帰RED）: 有効BET保存のstakeを5Gから100G、oddsを15.7から1570へ改ざん後に再読込してもstake 5G・odds 15.7・995G・active BET 1件へ復元され、払戻条件の保存値改ざん受理なしでPASS。
- V174限定PASS（V176では回帰RED）: 有効BET保存の単勝対象馬を1番から7番へ差し替え後に再読込しても1番・995G・active BET 1件へ復元され、対象馬の保存値改ざん受理なしでPASS。
- V174限定PASS（V176では回帰RED）: 5G BET確定後にBET前の完全なlocalStorage/sessionStorage保存状態を再投入して再読込しても995G・active BET 1件を維持し、旧保存状態によるBET巻き戻しなしでPASS。
- V174限定PASS（V176では回帰RED）: OFFICIAL RESULT精算後に精算前の有効BET保存状態を再投入して再読込しても995G・active BET 0件・履歴1件を維持し、BET復活・履歴消失・二重精算の入口なしでPASS。
- V174限定PASS（V176では回帰RED）: レース1精算後995Gの保存状態を、レース2の5G BET受理後に再投入して再読込しても990G・active BET 1件・履歴1件を維持し、旧精算済み状態による新規BET消失・5G返却なしでPASS。
- V176はrun 39064943862と最新head run 39064964822で、生成checksum `e6bb1504e75f558e783e0693a686d52666dd34667edf9f2cf5278133bed9ba55`、mandatory guards、2タブ同時BET→精算→タブB再読込を各3回連続（計6回）PASS。active BET 0・履歴1件へ収束し、V175で残った古いタブBメモリ復活を再現しなかった。
- V176物理スマホ準備ツールは、exact active-index、V176生成、V176固有契約、mandatory preflight、status contract、ローカル配信build marker確認をCIでPASS。これは起動準備ツールの検査結果であり、端末実走のPASSではない。
- V176→V173復旧ドリルはrun 39069060196で、V176 SHA-256 `e6bb1504e75f558e783e0693a686d52666dd34667edf9f2cf5278133bed9ba55`とV173 SHA-256 `84d505571c0b34962e234cb04b4ca187516a0368adf40f6903eafd80ac0ea85d`の完全一致、両checkpointのmandatory preflight、証拠artifact `12114044355`（digest `76c934d48ab8fd111cdebecd6726e441e5338d9e2992a942603d2c84bad9c3ed`）をPASS。
- V176一時公開準備ツールは、exact active-index、V176生成・固有契約、mandatory preflight、status contract、ローカル配信build markerをrun 39073621685でPASS。これは公開準備経路の検査であり、端末操作の合格証拠ではない。\n- exact V176の自然進行タイミングはrun 39081772440でAndroid Chrome相当（Pixel 7）とiPhone WebKit相当（iPhone 15）がともにPASS。レース開始→GOALは32.535秒 / 32.613秒、明示7秒RESULTホールドは7.027秒 / 7.070秒、GUEST 1,000G→確認付き5G BET→7頭→GOAL→OFFICIAL RESULT、PAGE_ERRORS=0。artifact `12119271817`（digest `fdf91d1c21e8e0ada4d49c9aea44b2b8330ff2890e749843b25de6454246be7c`）/ `12118724862`（digest `4d05ddf209a7f0bacfc147ea51e6319053f4485fc9cd5164c6f95d1a4906f029`）。

- GOLDEN HORSE権威状態contractはrun 39089304794でexact V176生成・mandatory preflight・contract検証をPASS。artifact `12121154609`（digest `9de45995bf1cbf02ebe0dde35d288de70967bbde40f31ebb2b3f89c16a02e6be`）。これはcontractのPASSであり、server実装のPASSではない。
- 権威API conformance準備はrun 39092495453でexact V176・mandatory guards・contract・9ケースfixture・runner構文をPASS。artifact `12123555316`（digest `029213c2e5459d9f126ce9dfdb9da7b4567f51bc09831b1e7a3bd115d7b4a086`）。これは検査器のPASSであり、live APIのPASSではない。

## RED

- 3回目のexact V176セキュリティ回帰run 39085793725は3 PASS / 7 FAIL。再読込継続・二重BET確認・精算履歴改ざん拒否がPASSし、他7系統はFAIL。精算履歴だけ2回目FAIL→3回目PASSへ反転し、FLAKY REDを再確認した。
- authority contract gate run 39089304794はcontract整合性をPASSしたが、server implementationはBLOCKED_MISSING。contract追加を改ざん対策の実装完了へ読み替えない。
- authority API conformance run 39092495453はfixture/runnerをPASSしたが、live実行はGH_AUTHORITY_API_URL未設定のためBLOCKED_NO_URL。9ケースをサーバー検証済みへ読み替えない。
- 接続済みSupabaseを読み取り確認したが、GOLDEN HORSE専用と明示できるprojectは確認できなかった。既存の別名projectには一切変更を行わない。
- exact V176セキュリティ回帰matrixは、run 39085268586で3 PASS / 7 FAIL、最終head run 39085548335で2 PASS / 8 FAIL。製品HTMLは未変更のまま、V174の旧合格をCURRENT V176へ再適用して新しい回帰と実行順依存を検出した。
- V176で保存G改ざん999,999G、受付済みBET削除+5G返却、stake 5→100・odds 2.1→210、対象馬1→7が再読込後に受理された。
- V176でBET前stale state（1000G・BET 0）、精算前state（995G・active BET 1・履歴0）、レース1精算済みstateのレース2後リプレイ（990G→995G）が受理された。
- BET/精算後再読込継続と二重確認冪等性は2回ともPASS。精算履歴改ざん拒否は初回PASSから最終headでFAILへ反転しFLAKY RED。他7系統は2回ともFAIL。全体をGREENへ読み替えない。
- V174の同検査はGREENだった。V175/V176で複数タブの古い状態上書きを止めるためpagehide/visibilitychangeのlocalSaveを除去した結果、改ざん値を再読込直前に正常メモリで上書きしていた偶発的防御も消えた挙動と一致する。クライアントだけで再び保存すると2タブ競合を再発させるため、権威サーバーなしの単純復活は行わない。
- 通信断BETはオフライン確認操作後も1000Gから995Gへ減り、active BET 1件としてクライアント内で受理される。
- 権威BETサーバー、API、DBスキーマ、冪等受付、監査ログの実装先はこのリポジトリ内に存在しない。
- PR #19は上記を隠さず保持する意図的RED証拠であり、PASSへ読み替えない。
- 同一ゲスト状態を複製した2タブから同時に5G BET確認後、run 39052004832ではタブA精算後もタブB再読込が995G・active BET 1件・履歴なしを復活、run 39052226802では同手順PASSとなった。結果が実行順で分岐する精算競合のためFLAKY RED（PR #31）。
- 診断run 39056497035で、タブB再読込直前の共有`gh_guest_isolated_v2_state`は精算済み（active BET 0・履歴1件）だが、再読込後に旧状態へ上書きされることを確認。run 39056689510再実行job 117466692656では、再読込後ハッシュ`b98a1014`が同一実行の同時BET確定直後ハッシュと完全一致し、タブBの古い確定直後スナップショット書戻しを確認した。
- `FRIEND-V109-LOOP-RESILIENCE`の古いライフサイクル保存を止めたV175でもrun 39060858813 / 39064571834は3回連続gate前にFAIL。後者では共有`gh_guest_isolated_v2_state`が995G・active BET 0・履歴1件の精算済み状態を維持した一方、タブBのメモリだけが995G・active BET 1件・履歴0件へ戻った。V175をPASSへ読み替えない。
- 残存呼出元は`GH_LINE_PERF9`の`visibilitychange(hidden)` / `pagehide`から呼ばれる`saveSafe()`内の`localSave()`。再読込直前に古いタブB状態を書き、読込後に別タブが共有保存を再修復する順序競合と一致する。V176候補はこの1か所のゲスト状態保存だけを止め、差分監査と独立したV129レース復旧スナップショットを残す。\n- WebKit相当ではRESULTパネル表示後に既存の正式結果ナレーションが11.763秒進み、その後7.070秒ホールドするため、パネル総表示は18.833秒。Chrome相当はナレーション1.331秒、総表示8.358秒。明示7秒ホールドは両方正常だが、音声を含む総表示7秒要件とみなす場合は未達であり、実機音声同期確認前にPASSへ読み替えない。

## NOT TESTED

- 物理AndroidでのV176完全フロー。
- 物理iPhoneでのV176完全フロー。
- 実LINE内ブラウザでのV176完全フロー。
- 実機音声同期。
- 本番相当のGPSサーバー拒否、正式会員、SMS、本人確認、GDB ID、支払い状態、退店後G付与。
- 隔離済みGOLDEN HORSE APIに対する9ケースauthority conformance実走。

## PROTECTED / DO NOT TOUCH

- main自動マージを行わない。
- 本番公開を行わない。
- Square本体を変更しない。
- 本番会員を変更しない。
- G台帳を変更しない。
- V166原本、V173 rollback、V174生成チェーンを上書きしない。
- V175はFAIL証拠として保持し、V176をCURRENT候補とする。main自動マージと本番公開は行わない。

## Resume Notes

- V174生成: `python scripts/create_v174_final_tabs_fix.py`
- V174 active index: `GH_ACTIVE_INDEX=checkpoints/V174_FINAL_FIVE_TABS/index.html`
- V175候補生成: `python scripts/create_v175_multitab_lifecycle_fix.py`
- V175候補検査: `python scripts/gh_v175_multitab_lifecycle_contract.py`
- V175候補active index（検査時のみ）: `GH_ACTIVE_INDEX=checkpoints/V175_MULTITAB_LIFECYCLE_FIX/index.html`
- V175 3回連続QA workflow（FAIL証拠）: `.github/workflows/v175-multitab-lifecycle-qa.yml`
- V176候補生成: `python scripts/create_v176_line_lifecycle_fix.py`
- V176候補検査: `python scripts/gh_v176_line_lifecycle_contract.py`
- V176 current active index: `GH_ACTIVE_INDEX=checkpoints/V176_LINE_LIFECYCLE_FIX/index.html`
- V176 3回連続QA workflow: `.github/workflows/v176-line-lifecycle-qa.yml`\n- V176自然進行タイミングQA workflow: `.github/workflows/v176-race-timing-qa.yml`\n- V176自然進行タイミングQA script: `scripts/gh_v176_race_timing_qa.mjs`
- V176セキュリティ回帰matrix: `.github/workflows/v176-security-regression-matrix.yml`
- V176セキュリティ回帰FLAKY RED: https://github.com/hiroshi0111m-ops/golden-horse/pull/36 / runs 39085268586, 39085548335, 39085793725
- V176権威状態contract gate: https://github.com/hiroshi0111m-ops/golden-horse/pull/37 / run 39089304794
- 権威状態contract: `contracts/golden_horse_authoritative_state_v1.json`
- 権威backend readiness gate: `python scripts/gh_authority_contract_gate.py --require-implementation`
- V176権威API conformance: https://github.com/hiroshi0111m-ops/golden-horse/pull/38 / run 39092495453
- 権威API fixture: `contracts/golden_horse_authority_conformance_v1.json`
- 権威API live gate: `GH_AUTHORITY_API_URL=<isolated-test-api> python scripts/gh_authority_api_conformance.py --require-api`
- V176物理スマホ起動: `RUN_V176_PHONE_TEST_FREE.bat`
- V176紫側・一時公開QA起動: `START_GOLDEN_HORSE_PUBLIC_FREE.bat`
- V176物理スマホ準備workflow: `.github/workflows/v176-phone-preview-tooling.yml`
- 復旧検査: `python scripts/gh_rc_restore_drill.py`
- 静的preflight: `GH_ACTIVE_INDEX=checkpoints/V176_LINE_LIFECYCLE_FIX/index.html python scripts/gh_preflight.py`
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
- 2タブ同時BET・精算競合修正とV176 GREEN: https://github.com/hiroshi0111m-ops/golden-horse/pull/31
- V176→V173復旧GREEN: https://github.com/hiroshi0111m-ops/golden-horse/pull/33
