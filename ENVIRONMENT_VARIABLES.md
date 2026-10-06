# Variables de entorno

Usa `.env.example` como referencia. [Lista exacta por proveedor](docs/CONTENT_ENGINE_CREDENTIALS.md).

## Obligatorias

- `ADMIN_API_TOKEN`: secreto largo para el API del panel.
- `SUPABASE_URL`: obligatoria en producción.
- `SUPABASE_SERVICE_ROLE_KEY`: obligatoria en producción y exclusiva del backend.
- `REQUIRE_SUPABASE`: usar `true` en cualquier despliegue; evita persistencia
  efímera si faltan las variables de Supabase.

## Chatbot existente

`VERIFY_TOKEN`, `GEMINI_API_KEY`, `PAGE_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `EMAIL_USER`, `EMAIL_PASS`.

## Video

`CONTENT_ENGINE_MAX_UPLOAD_BYTES`, `CONTENT_ENGINE_CHUNK_BYTES`, `CONTENT_ENGINE_UPLOAD_DIR`, `CONTENT_ENGINE_WORK_DIR`, `CONTENT_ENGINE_MAX_CONCURRENT_VIDEO_JOBS`, `CONTENT_ENGINE_RETENTION_DAYS`.

- `CONTENT_ENGINE_VIDEO_MODE`: `local` o `disabled`. Producción usa `disabled`
  por defecto si no se define.
- `CONTENT_ENGINE_LOCAL_STORAGE_DURABLE`: debe ser `true` para habilitar video
  local en producción. No lo uses en Render Free.
- `LOCAL_WORKER_API_TOKEN`: secreto exclusivo para el agente de la PC; no
  reutilizar `ADMIN_API_TOKEN` ni `N8N_WEBHOOK_SECRET`.
- `LOCAL_WORKER_MAX_ARTIFACT_BYTES`: límite por artefacto sincronizado; el
  Blueprint gratuito usa 50331648 bytes (48 MiB).

## Sociales y n8n

`META_APP_ID`, `META_APP_SECRET`, `META_GRAPH_API_VERSION`, IDs de página/cuenta, credenciales OAuth de TikTok, `N8N_WEBHOOK_SECRET` y `N8N_BASE_URL`.

- `SOCIAL_PUBLISH_MODE`: debe permanecer `draft`.
- `SOCIAL_EXTERNAL_REQUESTS_ENABLED`: debe permanecer `false`.
- `SOCIAL_TOKEN_ENCRYPTION_KEY`: base64 de exactamente 32 bytes. Configurar de forma segura: el generador genérico de Render no garantiza ese formato; el Blueprint Free usa `sync:false`.
- `PIXELLABS_API_URL`: URL pública del backend para n8n.
- `PIXELLABS_N8N_API_TOKEN`: copia de `N8N_WEBHOOK_SECRET`, configurada dentro de
  n8n y nunca exportada en JSON. No usar el token administrativo.
- `N8N_REQUIRE_HTTPS`: debe ser `true` en Render; rechaza automatizaciones que
  no lleguen por HTTPS.
- `N8N_WEBHOOK_SECRET`, `ADMIN_API_TOKEN` y `LOCAL_WORKER_API_TOKEN` deben ser
  distintos. En producción, el secreto de n8n debe tener al menos 32 caracteres.

`CONTENT_ENGINE_AUTO_PUBLISH` no sustituye la configuración de base de datos ni las barreras; la publicación continúa apagada hasta aprobación explícita.

`AUTO_PUBLICATION=false` es un alias de seguridad; cualquier bandera automática activa se rechaza. `SOCIAL_OAUTH_ENABLED=false` bloquea conexión de cuentas, independientemente de la publicación.

`CONTENT_ENGINE_AI_ENABLED=false`, `CONTENT_ENGINE_GEMINI_FREE_TIER_CONFIRMED=false`, `CONTENT_ENGINE_GEMINI_MODEL=gemini-3.5-flash-lite`, `CONTENT_ENGINE_GEMINI_MAX_REQUESTS_PER_DAY=12` controlan IA editorial sin cambiar el modelo del chatbot. `SUPABASE_ANON_KEY` es compatible y opcional: el backend actual no la necesita.
