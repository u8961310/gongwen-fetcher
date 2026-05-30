@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist ".env" (
  echo 尚未設定帳號密碼，請重新執行安裝程式。
  pause
  exit /b 1
)
set "NODE=node"
if exist "runtime\node\node.exe" set "NODE=runtime\node\node.exe"
if exist "ms-playwright" set "PLAYWRIGHT_BROWSERS_PATH=%~dp0ms-playwright"
"%NODE%" src\index.js
echo.
pause
