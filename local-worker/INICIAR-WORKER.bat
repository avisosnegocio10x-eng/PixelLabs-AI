@echo off
setlocal
cd /d "%~dp0.."

if not exist "local-worker\.env" (
  echo Falta local-worker\.env
  echo Copia config.example.env como .env y completa el token directamente en tu PC.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Instalando dependencias verificadas...
  call npm ci
  if errorlevel 1 (
    echo No se pudieron instalar las dependencias.
    pause
    exit /b 1
  )
)

node scripts\localVideoWorker.js
if errorlevel 1 pause
endlocal
