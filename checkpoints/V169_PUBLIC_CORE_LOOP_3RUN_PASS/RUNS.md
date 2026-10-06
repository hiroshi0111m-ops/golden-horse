# GOLDEN HORSE 公開DEV 3回連続実走 — 2026-10-06

CP: CP_V169_PUBLIC_CORE_LOOP_3RUN_PASS
公開: V169 / PageShare Version32
本線: gh-rc-20261020

内蔵ブラウザの同じタブで、再読み込みなし、レース中SKIPなしで3回連続実操作した。全回でRESULTの次レースボタンを押し、次のBETの馬選択とBETボタン有効化まで確認。

| 工程 | RUN1 | RUN2 | RUN3 |
|---|---|---|---|
|①GUEST|PASS|PASS|PASS|
|②初期ちょうど1000G|PASS|PASS|PASS|
|③BET受付|PASS|PASS|PASS|
|④7頭発走|PASS|PASS|PASS|
|⑤GOAL|PASS|PASS|PASS|
|⑥RESULT|PASS|PASS|PASS|
|⑦次レースBET操作|PASS|PASS|PASS|

RUN1: 第72→73、1000→990→990G。単勝1番10G、的中なし。
RUN2: 第73→74、1000→930→970→1020G。全7頭に単勝10G、払戻40G、既存初クリア報酬50G。
RUN3: 第74→75、1000→990→1011G。単勝1番10G、払戻21G。

CORE LOOP: PASS。ゲーム変更なし、再公開なし。V149表示は現行ソースの残存ラベル。ゲームソースのSHA256は5b9be8568249f7de73985a94e041f9964dc914d09f38be30facb02b39734299a。

以前のEdgeクリック不可は今回再現しなかった。過去のFAILは消去せず、原因未確定のまま保持。このPASSは今回観測したゲストループに限定し、会員/サーバー/決済等は未検証。自動7秒遷移は今回3回の選択経路ではない。

ROLLBACK: 公開Version32、記録保存前commit 2e8a39724c636b9b93fc927bfd3f7d58e95f5fcc、既存Version31/pre-fix 7a0e0332564b9765e2f8173cc5890ae81a9c3d0e、Version28保持。
NEXT ONE ACTION: 同じ公開Version32で、既報のEdge RESULTボタンのクリック不可条件を再確認する。新機能へは進まない。

詳細: CHECKPOINT.json / EVIDENCE.json。ローカル証拠: C:/Users/hiroshi/.codex/visualizations/2026/10/05/01a10990-0079-7341-9603-06bd3197897b/20261006-public-core-loop/
