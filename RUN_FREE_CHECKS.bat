@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo GOLDEN HORSE 無料チェックを開始します...
where python >nul 2>nul
if %errorlevel%==0 (
  python scripts\gh_preflight.py
) else (
  py scripts\gh_preflight.py
)
echo.
echo 終了コード: %errorlevel%
pause
