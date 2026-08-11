@echo off
setlocal
cd /d "%~dp0"

where docker >nul 2>nul
if errorlevel 1 (
  echo Docker Desktop no esta instalado o no esta disponible en PATH.
  exit /b 1
)

if not exist config.env (
  echo Falta n8n\local\config.env.
  echo Copia config.example.env como config.env y completa solamente los dos secretos.
  exit /b 1
)

docker compose up -d
if errorlevel 1 exit /b 1

docker compose ps
echo.
echo n8n local: http://127.0.0.1:5678
