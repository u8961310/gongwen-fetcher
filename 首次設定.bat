@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "NODE=node"
if exist "runtime\node\node.exe" set "NODE=runtime\node\node.exe"
"%NODE%" src\setup.js
pause
