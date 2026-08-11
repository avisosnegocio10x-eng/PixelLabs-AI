@echo off
setlocal
cd /d "%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0CONFIGURAR-N8N.ps1"
set "pixellabs_exit=%ERRORLEVEL%"

echo.
if not "%pixellabs_exit%"=="0" (
  echo La configuracion no termino. Revisa el error mostrado arriba.
)
pause
exit /b %pixellabs_exit%
