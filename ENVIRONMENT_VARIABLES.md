# Variables de entorno

Usa `.env.example` como referencia.

## Obligatorias

- `ADMIN_API_TOKEN`: secreto largo para el API del panel.
- `SUPABASE_URL`: obligatoria en producción.
- `SUPABASE_SERVICE_ROLE_KEY`: obligatoria en producción y exclusiva del backend.

## Chatbot existente

`VERIFY_TOKEN`, `GEMINI_API_KEY`, `PAGE_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `EMAIL_USER`, `EMAIL_PASS`.

## Video

`CONTENT_ENGINE_MAX_UPLOAD_BYTES`, `CONTENT_ENGINE_CHUNK_BYTES`, `CONTENT_ENGINE_UPLOAD_DIR`, `CONTENT_ENGINE_WORK_DIR`, `CONTENT_ENGINE_MAX_CONCURRENT_VIDEO_JOBS`, `CONTENT_ENGINE_RETENTION_DAYS`.

## Sociales y n8n

`META_APP_ID`, `META_APP_SECRET`, `META_GRAPH_API_VERSION`, IDs de página/cuenta, credenciales OAuth de TikTok, `N8N_WEBHOOK_SECRET` y `N8N_BASE_URL`.

`CONTENT_ENGINE_AUTO_PUBLISH` no sustituye la configuración de base de datos ni las barreras; la publicación continúa apagada hasta aprobación explícita.
