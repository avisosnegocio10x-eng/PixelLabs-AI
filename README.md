# PixelLabs AI + Content Engine

Backend de PixelLabs para atención por Messenger, Instagram y WhatsApp, cotizaciones y la nueva base del sistema de contenido.

## Estado actual

La rama `agent/pixellabs-content-engine` incluye una primera base ejecutable:

- Centro de Contenido protegido por token administrativo.
- Configuración editable de publicaciones, historias y reels diarios.
- Aprobación manual por defecto e interruptor global de emergencia.
- Esquema Supabase/PostgreSQL con catálogo, tendencias, contenido, revisiones, calendario, métricas, atribución y biblioteca de video.
- Subida reanudable por fragmentos, validación con `ffprobe`, checksum, proxy y segmentación con `ffmpeg`.
- Doce flujos n8n importables, desactivados por defecto.
- Barrera determinista contra publicación de contenido riesgoso o sin aprobación.
- Pruebas automáticas con `node:test`.
- Catálogo real con búsqueda por referencia, disponibilidad y enfriamiento de promociones.
- CRM Supabase para contactos, conversaciones, mensajes y oportunidades, con modo local compatible.
- Ciclo de borrador, ocho revisiones, aprobación/rechazo humano y auditoría.
- Detección de escenas, silencios y cuadros negros, propuesta de clips y render vertical con portada.
- Worker persistente para los 12 flujos n8n y recuperación después de reinicios.
- Variantes diferentes para Facebook, Instagram y TikTok en modo borrador.
- Docker y Blueprint de Render con `ffmpeg`, disco persistente y secretos fuera del repositorio.

Todavía no se publican contenidos reales. `SOCIAL_PUBLISH_MODE=draft`, la aprobación es manual y los flujos n8n están desactivados. Las conexiones OAuth, credenciales de Supabase y aprobación de las apps de Meta/TikTok son bloqueos externos deliberados.

## Inicio local

```bash
npm install
cp .env.example .env
npm test
npm start
```

Configura al menos `ADMIN_API_TOKEN`. En producción también son obligatorios `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`.

Panel: `http://localhost:3000/admin`

## Rutas nuevas

- `GET /admin/api/content-engine/settings`
- `PATCH /admin/api/content-engine/settings`
- `POST /admin/api/content-engine/emergency-stop`
- `POST /admin/api/content-engine/videos/uploads`
- `PUT /admin/api/content-engine/videos/uploads/:id/chunks`
- `POST /admin/api/content-engine/videos/uploads/:id/complete`
- `POST /admin/api/content-engine/videos/uploads/:id/pause`
- `POST /admin/api/content-engine/videos/uploads/:id/resume`
- `POST /admin/api/content-engine/jobs/:workflow`
- `GET /admin/api/content-engine/catalog/products`
- `PATCH /admin/api/content-engine/catalog/products/:reference/availability`
- `POST /admin/api/content-engine/content`
- `POST /admin/api/content-engine/content/:id/review`
- `POST /admin/api/content-engine/content/:id/approve`
- `GET /admin/api/content-engine/videos`
- `GET /admin/api/content-engine/clips`
- `POST /admin/api/content-engine/videos/:uploadId/clips/:clipId/render`
- `POST /admin/api/content-engine/videos/:uploadId/clips/:clipId/review`
- `GET /admin/api/content-engine/social/capabilities`
- `POST /admin/api/content-engine/content/:id/export/:platform`

Todas requieren `Authorization: Bearer <ADMIN_API_TOKEN>`.

## Validación

```bash
npm ci
npm run check
```

`npm run check` valida sintaxis, 12 flujos n8n inactivos, pruebas HTTP, seguridad, video real con `ffmpeg` y reglas de aprobación.

## Documentación

Consulta `ARCHITECTURE.md`, `DATABASE.md`, `VIDEO_PROCESSING.md`, `SOCIAL_APIS.md`, `N8N_WORKFLOWS.md`, `SECURITY.md`, `TESTING.md` y `DEPLOYMENT.md`.
