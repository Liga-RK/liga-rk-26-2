@echo off
setlocal
cd /d "%~dp0"
start "" /B node .\stats-server.js
timeout /t 2 /nobreak >nul
start "" "http://localhost:4177/stats-admin.html"
echo Liga RK 26.2 aberto em http://localhost:4177/stats-admin.html
echo Feche esta janela quando quiser parar o servidor local.
pause
