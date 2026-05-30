@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "NODE=node"
if exist "runtime\node\node.exe" set "NODE=runtime\node\node.exe"
if exist "ms-playwright" set "PLAYWRIGHT_BROWSERS_PATH=%~dp0ms-playwright"
"%NODE%" src\index.js >> run.log 2>&1
