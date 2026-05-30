@echo off
chcp 65001 >nul
cd /d "%~dp0"
schtasks /Create /TN "公文附件下載器" /TR "\"%~dp0run.bat\"" /SC DAILY /ST 08:00 /F
if %errorlevel%==0 (
  echo 已設定每天早上 08:00 自動下載。
) else (
  echo 設定排程失敗，請以系統管理員身分再試一次。
)
pause
