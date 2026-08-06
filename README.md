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

Todavía no se publican contenidos reales. Las conexiones OAuth, credenciales de Supabase y aprobación de las apps de Meta/TikTok son bloqueos externos deliberados.

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

Todas requieren `Authorization: Bearer <ADMIN_API_TOKEN>`.

## Documentación

Consulta `ARCHITECTURE.md`, `DATABASE.md`, `VIDEO_PROCESSING.md`, `SOCIAL_APIS.md`, `N8N_WORKFLOWS.md`, `SECURITY.md`, `TESTING.md` y `DEPLOYMENT.md`.
