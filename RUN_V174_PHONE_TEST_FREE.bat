@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

set "GH_ACTIVE_INDEX=checkpoints\V174_FINAL_FIVE_TABS\index.html"
set "GH_PORT=8000"

echo =====================================================
echo GOLDEN HORSE V174 物理スマホ確認 / 無料・同一Wi-Fi
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

echo [1/3] V174を保存版から生成...
%PY% scripts\create_v174_final_tabs_fix.py
if errorlevel 1 (
  echo V174生成に失敗しました。旧版は起動しません。
  pause
  exit /b 1
)

echo [2/3] 原本・7工程・静的ガード確認...
%PY% scripts\gh_preflight.py
if errorlevel 1 (
  echo プレフライト失敗。スマホ確認を開始しません。
  pause
  exit /b 1
)

echo [3/3] V174だけをローカル起動...
start "GOLDEN HORSE V174 PHONE SERVER" cmd /k "set GH_ACTIVE_INDEX=%GH_ACTIVE_INDEX%&& set GH_PORT=%GH_PORT%&& %PY% scripts\serve_golden_horse.py"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:%GH_PORT%/"

echo.
echo 別ウィンドウの PHONE: http://...:8000/ をスマホで開いてください。
echo PCとスマホは同じWi-Fiにします。
echo そのURLをLINEで自分へ送り、LINE内ブラウザ確認にも使えます。
echo.
echo 確認順:
echo ホーム ^> レース ^> 5G BET ^> 7頭 ^> RESULT ^> 次レース120秒
echo 最終5タブ:
echo ホーム / レース / 育成 / 特典 / マイページ
echo.
echo この案内画面は閉じて構いません。サーバー画面は確認終了まで残してください。
pause
endlocal
