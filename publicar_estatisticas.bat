@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo ERRO: Node.js nao foi encontrado.
  pause
  exit /b 1
)

echo [1/7] Executando testes...
call npm test || goto :failed

echo [2/7] Validando JavaScript...
call npm run check || goto :failed

echo [3/7] Validando cadastros oficiais...
call npm run content:integrity || goto :failed

echo [4/7] Gerando payload publico sanitizado...
call npm run stats:generate || goto :failed

echo [5/7] Validando payload publico...
call npm run stats:validate || goto :failed

echo [6/7] Gerando o site publico isolado...
call npm run build:public || goto :failed

echo [7/7] Procurando arquivos privados, segredos e caminhos locais...
call npm run smoke:public || goto :failed

echo.
echo Arquivos alterados:
git status --short
echo.
echo A preparacao terminou sem publicar nada.
choice /C SN /N /M "Voce revisou o painel e deseja considerar esta build pronta para commit manual? [S/N] "
if errorlevel 2 goto :cancelled

echo.
echo Build confirmada para revisao manual.
echo Este arquivo NAO fez commit, push ou deploy.
echo Revise as alteracoes no GitHub Desktop antes de publicar.
pause
exit /b 0

:cancelled
echo Nenhuma publicacao foi realizada.
pause
exit /b 0

:failed
echo.
echo ERRO: a preparacao foi interrompida. Nada foi publicado.
pause
exit /b 1
