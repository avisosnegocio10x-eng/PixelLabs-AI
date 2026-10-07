@echo off
setlocal
cd /d "%~dp0"
echo Instalador local PixelLabs. Publicacion desactivada. Costo: 0 USD.
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup\windows\install.ps1" %*
set "pixellabs_exit=%ERRORLEVEL%"
echo.
if "%pixellabs_exit%"=="3010" echo REBOOT REQUIRED. Reinicia Windows y ejecuta este archivo nuevamente.
if not "%pixellabs_exit%"=="0" echo La instalacion no esta completada. Revisa el mensaje anterior.
if /I not "%PIXELLABS_NO_PAUSE%"=="1" pause
exit /b %pixellabs_exit%
