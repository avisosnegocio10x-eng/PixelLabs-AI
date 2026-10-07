@echo off
setlocal
cd /d "%~dp0"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup\windows\repair.ps1" %*
set "pixellabs_exit=%ERRORLEVEL%"
if /I not "%PIXELLABS_NO_PAUSE%"=="1" pause
exit /b %pixellabs_exit%
