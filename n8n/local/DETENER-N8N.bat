@echo off
setlocal
cd /d "%~dp0"

docker compose stop

echo n8n fue detenido. El volumen pixellabs_n8n_data se conserva.
