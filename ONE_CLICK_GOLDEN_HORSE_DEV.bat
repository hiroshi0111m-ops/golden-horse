@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo GOLDEN HORSE 1クリックDEV
echo ============================================

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

echo [1/2] 無料プレフライトチェック...
%PY% scripts\gh_preflight.py
if errorlevel 1 (
  echo.
  echo チェックで停止しました。ゲームは起動しません。
  pause
  exit /b 1
)

echo [2/2] ローカルDEVサーバー起動...
start "GOLDEN HORSE DEV SERVER" cmd /k "%PY% scripts\serve_golden_horse.py"
timeout /t 2 /nobreak >nul

start "" "http://127.0.0.1:8000/"

echo.
echo PCのブラウザを開きました。
echo スマホ用URLは「GOLDEN HORSE DEV SERVER」の画面に表示されます。
echo スマホとPCは同じWi-Fiにしてください。
echo.
echo この画面は閉じてOKです。
timeout /t 5 /nobreak >nul
endlocal
