@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo GOLDEN HORSE 無料・一時公開URL
echo Cloudflare Quick Tunnel / 開発テスト専用
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

echo [1/3] プレフライト...
%PY% scripts\gh_preflight.py
if errorlevel 1 (
  echo プレフライト失敗。公開しません。
  pause
  exit /b 1
)

echo [2/3] ローカルサーバー起動...
start "GOLDEN HORSE LOCAL SERVER" cmd /k "%PY% scripts\serve_golden_horse.py"
timeout /t 2 /nobreak >nul

echo [3/3] Cloudflare Quick Tunnel...
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
echo メール認証を付ける場合だけメールアドレスを入力してください。
echo 入力せずEnterなら、一時URLを知っている人がアクセスできます。
set /p GH_ALLOWED_MAIL=メール制限（任意）: 

echo.
echo 下に表示される https://xxxxx.trycloudflare.com が無料の一時URLです。
echo LINEやスマホへ送って確認できます。
echo この画面を閉じるとURLは停止します。
echo.

if "%GH_ALLOWED_MAIL%"=="" (
  cloudflared tunnel --url http://127.0.0.1:8000
) else (
  cloudflared tunnel --url http://127.0.0.1:8000 --allowed-mail "%GH_ALLOWED_MAIL%"
)

endlocal
