# QA del instalador Windows — 2026-10-07

HEAD inicial local/remoto: `e7781fdddafbf6fc68538d8c3e8f4414063ac514`, checkout limpio, rama `agent/pixellabs-content-engine`. Referencia `main`: `7083227c9f077d786b51641507677aa8b3c04453`; no se modificó.

Resultado del código implementado, **sin declarar una instalación integral en Windows**:

| Comprobación | Resultado |
|---|---|
| Baseline antes de editar | 102/102 tests |
| Suite completa y sandbox QA con Node 22.23.3 LTS | 118/118, 0 fallos, 0 omitidos |
| Tests PowerShell 7.4.19 aislados | 24/24, sintaxis de todos los scripts válida |
| n8n Community 2.33.7 con Node 22 | 12/12 workflows reales ejecutados, 0 activos |
| Backend aislado de n8n | 10 trabajos completados, 2 videos conservados en cola local |
| Instalación n8n nueva sin workflows | CLI real devuelve código 1 y mensaje exacto de base vacía; el instalador admite solo ese caso antes de importar |
| Worker/servicios | Arranque HTTP loopback, OAuth bloqueado, worker offline en pausa y parada por instancia aprobados |
| Video/FFmpeg/ffprobe | MP4 H.264 y probe reales; processor existente renderiza clips/portadas en la suite |
| Migraciones | Seis SQL en PostgreSQL PGlite; historial/hash, adopción de cinco ya verificadas, aplicación de la sexta, rerun sin reaplicar y rollback de publicación insegura |
| Secretos/configuración | RNG 32 bytes, cinco distintos, base64 social exacto, preservación al reinstalar, logs redactados, worker separado de credenciales backend |
| Legacy | Backend/chatbot, package.json/lock, modelo Gemini y diez entradas/scripts relevantes preservados byte por byte |
| Redes sociales/IA | 0 solicitudes sociales reales; 0 llamadas de generación IA; OAuth/publicación apagados |
| Pago/deploy | $0; ningún servicio contratado/activado/desplegado |

## Evidencia reproducible

La instalación ejecuta `self-test.ps1`, `qa.js --n8n`, verificación de salud y exportación operativa. `qa.js` crea una copia temporal sin `.env`, perfiles privados, videos o estado, y conecta node_modules por junction; el QA n8n se prepara en un contenedor efímero con `--network none` sin montar el volumen persistente operativo.

En esta sesión se ejecutaron `qa.js` con Node 22, `self-test.ps1` con PowerShell real, el smoke reproducible existente con `N8N_QA_BINARY` apuntando a n8n 2.33.7 y pruebas de CLI sobre una base n8n vacía. Los paquetes oficiales Node/Microsoft usados para QA se descargaron y verificaron por SHA-256. No se cambió el lockfile ni se añadió n8n al package.json.

## Pendiente físico

El entorno disponible es Linux y no dispone de Docker Desktop/Windows. Los metadatos de Windows/WSL/winget y las ACL se simulan en los tests PowerShell. **No se comprobaron UAC, reinicio real, winget, ACL NTFS, Docker Desktop ni el Compose completo en Windows.** Tampoco se conectaron Supabase/Gemini reales ni OAuth Meta/TikTok.

El instalador está implementado para probarlo en el PC. Solo ese equipo puede confirmar el recorrido completo de doble clic, UAC/WSL/reinicio, importación persistente y arranque Docker. El script falla con código distinto de cero y no imprime instalación completada ante fallos de dependencias, seguridad o pruebas.
