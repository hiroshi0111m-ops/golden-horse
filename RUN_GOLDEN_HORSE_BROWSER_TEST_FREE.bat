@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo GOLDEN HORSE 無料ローカル自動ブラウザ試験
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

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js が見つかりません。
  where winget >nul 2>nul
  if errorlevel 1 (
    echo winget もありません。Node.js LTSを入れてから再実行してください。
    pause
    exit /b 1
  )
  echo Node.js LTSを無料インストールします。
  winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
  echo.
  echo インストール後、この画面を閉じてもう一度このファイルを実行してください。
  pause
  exit /b 0
)

echo [1/5] プレフライト...
%PY% scripts\gh_preflight.py
if errorlevel 1 (
  echo プレフライトFAIL
  pause
  exit /b 1
)

echo [2/5] Playwright準備...
call npm install --no-save playwright
if errorlevel 1 (
  echo Playwrightの準備に失敗しました。
  pause
  exit /b 1
)

echo [3/5] Chromium準備...
call npx playwright install chromium
if errorlevel 1 (
  echo Chromiumの準備に失敗しました。
  pause
  exit /b 1
)

echo [4/5] テストサーバー起動...
start "GOLDEN HORSE TEST SERVER" cmd /k "%PY% -m http.server 4173 --bind 127.0.0.1"
timeout /t 2 /nobreak >nul

echo [5/5] Android 390x844 自動ブラウザ試験...
node scripts\gh_runtime_smoke.mjs
set TEST_EXIT=%errorlevel%

echo.
if "%TEST_EXIT%"=="0" (
  echo ===== 自動ブラウザ試験 PASS =====
) else (
  echo ===== 自動ブラウザ試験 FAIL =====
  echo runtime-network-report.json / trace / CPU診断を確認してください。
)
echo.
pause
exit /b %TEST_EXIT%
