@echo off
setlocal
cd /d "%~dp0"

docker compose exec -T n8n n8n import:workflow --separate --input=/workflows
if errorlevel 1 exit /b 1

echo.
echo Los 12 workflows fueron importados. Deben permanecer Inactive.
