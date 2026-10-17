@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

set "GH_ACTIVE_INDEX=checkpoints\V176_LINE_LIFECYCLE_FIX\index.html"
set "GH_PORT=8000"

echo =====================================================
echo GOLDEN HORSE V176 物理スマホ確認 / 無料・同一Wi-Fi
echo =====================================================

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

echo [1/4] V176を保存版から生成...
%PY% scripts\create_v176_line_lifecycle_fix.py
if errorlevel 1 (
  echo V176生成に失敗しました。旧版は起動しません。
  pause
  exit /b 1
)

echo [2/4] V176固有契約を確認...
%PY% scripts\gh_v176_line_lifecycle_contract.py
if errorlevel 1 (
  echo V176契約検査に失敗しました。スマホ確認を開始しません。
  pause
  exit /b 1
)

echo [3/4] 原本・7工程・静的ガード確認...
%PY% scripts\gh_preflight.py
if errorlevel 1 (
  echo プレフライト失敗。スマホ確認を開始しません。
  pause
  exit /b 1
)

echo [4/4] V176だけをローカル起動...
start "GOLDEN HORSE V176 PHONE SERVER" cmd /k "set GH_ACTIVE_INDEX=%GH_ACTIVE_INDEX%&& set GH_PORT=%GH_PORT%&& %PY% scripts\serve_golden_horse.py"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:%GH_PORT%/"

echo.
echo 別ウィンドウの PHONE: http://...:8000/ をスマホで開いてください。
echo PCとスマホは同じWi-Fiにします。
echo そのURLを自分のLINEへ送り、実際のLINE内ブラウザでも同じ確認をします。
echo.
echo 録画する確認順:
echo GUEST 1000G ^> レース ^> 1番単勝5G BET ^> 7頭発走 ^> GOAL ^> OFFICIAL RESULT ^> 手動次レース120秒
echo 最終5タブ:
echo ホーム / レース / 育成 / 特典 / マイページ
echo.
echo Chrome確認後、同じURLをLINE内ブラウザで開いて同じ1周を確認してください。
echo 未確認項目はPASSにしません。
echo この案内画面は閉じて構いません。サーバー画面は確認終了まで残してください。
pause
endlocal
