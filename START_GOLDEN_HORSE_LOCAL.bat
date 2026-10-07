@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo GOLDEN HORSE 無料ローカルDEVを起動します...
where python >nul 2>nul
if %errorlevel%==0 (
  python scripts\serve_golden_horse.py
  goto :end
)
where py >nul 2>nul
if %errorlevel%==0 (
  py scripts\serve_golden_horse.py
  goto :end
)
echo Python が見つかりません。
echo Codex/開発PCにPythonを入れてから再実行してください。
pause
:end
