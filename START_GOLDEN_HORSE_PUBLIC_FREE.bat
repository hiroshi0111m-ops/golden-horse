@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

set "GH_ACTIVE_INDEX=checkpoints\V176_LINE_LIFECYCLE_FIX\index.html"
set "GH_PORT=8000"

echo =====================================================
echo GOLDEN HORSE V176 無料・一時公開URL
echo Cloudflare Quick Tunnel / 独立実機QA専用
echo =====================================================
echo V176以外の保存版、main、本番データは公開しません。

where python >nul 2>nul
if %errorlevel%==0 (
  set "PY=python"
) else (
  where py >nul 2>nul
  if %errorlevel%==0 (
    set "PY=py"
  ) else (
    echo Python が見つかりません。
    pause
    exit /b 1
  )
)

echo [1/5] V176を保存版から生成...
%PY% scripts\create_v176_line_lifecycle_fix.py
if errorlevel 1 (
  echo V176生成に失敗しました。別版は公開しません。
  pause
  exit /b 1
)

echo [2/5] V176固有契約を確認...
%PY% scripts\gh_v176_line_lifecycle_contract.py
if errorlevel 1 (
  echo V176契約検査に失敗しました。公開しません。
  pause
  exit /b 1
)

echo [3/5] 原本・7工程・静的ガード確認...
%PY% scripts\gh_preflight.py
if errorlevel 1 (
  echo プレフライト失敗。公開しません。
  pause
  exit /b 1
)

echo [4/5] V176だけをローカル起動...
start "GOLDEN HORSE V176 PUBLIC QA SERVER" cmd /k "set GH_ACTIVE_INDEX=%GH_ACTIVE_INDEX%&& set GH_PORT=%GH_PORT%&& %PY% scripts\serve_golden_horse.py"
timeout /t 2 /nobreak >nul

echo [5/5] Cloudflare Quick Tunnel...
where cloudflared >nul 2>nul
if errorlevel 1 (
  echo cloudflared がありません。Windows Package Managerで無料インストールを試します。
  where winget >nul 2>nul
  if errorlevel 1 (
    echo winget も見つかりません。
    echo Cloudflare公式から cloudflared を入れて、このファイルをもう一度実行してください。
    pause
    exit /b 1
  )
  winget install --id Cloudflare.cloudflared -e --accept-package-agreements --accept-source-agreements
  if errorlevel 1 (
    echo cloudflared のインストールに失敗しました。
    pause
    exit /b 1
  )
)

echo.
echo 下に表示される https://xxxxx.trycloudflare.com がV176だけの無料一時URLです。
echo 紫側・物理スマホ・実LINE内ブラウザへ同じURLを渡してください。
echo URLを知る人はアクセスできるため、本番会員・個人情報・決済情報を入力しないでください。
echo この画面を閉じるとURLは停止します。固定URLや本番公開ではありません。
echo.
echo 録画する確認順:
echo GUEST 1000G ^> レース ^> 1番単勝5G BET ^> 7頭発走 ^> GOAL ^> OFFICIAL RESULT ^> 手動次レース120秒
echo 最終5タブ:
echo ホーム / レース / 育成 / 特典 / マイページ
echo.

cloudflared tunnel --url http://127.0.0.1:%GH_PORT%

endlocal
