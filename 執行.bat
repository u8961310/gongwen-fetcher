@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist ".env" (
  echo 尚未設定，請先雙擊「首次設定.bat」輸入帳號密碼與網址。
  pause
  exit /b 1
)
set "NODE=node"
if exist "runtime\node\node.exe" set "NODE=runtime\node\node.exe"
"%NODE%" src\index.js
echo.
pause
