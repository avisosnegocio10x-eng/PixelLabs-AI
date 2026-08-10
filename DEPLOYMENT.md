# Despliegue

Existen dos Blueprints independientes:

- `render.free.yaml`: API gratuita para desarrollo y pruebas, sin disco y con
  video pesado desactivado. Usa `Dockerfile.free`, que no instala FFmpeg.
- `render.yaml`: perfil combinado Starter con disco para una futura activación
  pagada.

Ninguno tiene Auto Deploy habilitado. Guardar estos archivos no crea recursos ni
genera cargos. La comparación completa está en `DEPLOYMENT_FREE.md`.

## Backend en Render

- `Dockerfile` instala Node 22, `ffmpeg`, `ffprobe` y `dumb-init` para el perfil
  pagado/local.
- `render.yaml` fija la rama `agent/pixellabs-content-engine` y desactiva Auto Deploy.
- Health de despliegue: `GET /healthz`, que comprueba Supabase sin exponer
  credenciales.
- Disco persistente de 10 GB montado en `/app/storage`.
- `CONTENT_ENGINE_VIDEO_MODE=local` y almacenamiento marcado como durable.
- `REQUIRE_SUPABASE=true`; no existe fallback JSON en producción.
- `ADMIN_API_TOKEN`, `N8N_WEBHOOK_SECRET` y `SOCIAL_TOKEN_ENCRYPTION_KEY` se generan en Render.
- Supabase se solicita con `sync: false`; los valores no se guardan en Git.

Este perfil conserva la implementación existente, pero no debe activarse todavía.
Para videos de varias horas se recomienda separar API, almacenamiento de objetos
y worker cuando el volumen justifique el costo.

## Costo mínimo viable

Render solo permite disco persistente en servicios pagados. El filesystem del
plan gratuito es efímero y perdería subidas al reiniciar, por lo que el perfil
gratuito bloquea los endpoints de video en vez de aceptar datos que podrían
perderse. A los precios consultados el 10 de agosto de 2026, Starter cuesta cerca
de $7/mes y el disco $0.25 por GB/mes: 10 GB equivalen a $2.50, para un total
aproximado de $9.50/mes.

## Perfil gratuito

El perfil gratuito conserva la persistencia en Supabase para backend, panel,
chatbot, catálogo, CRM, webhooks, contenido y colas. No escribe archivos
permanentes en Render. La prueba automatizada garantiza que ese Blueprint:

- use `plan: free`;
- no declare `disk`;
- mantenga publicación real apagada;
- exija Supabase;
- deje `CONTENT_ENGINE_VIDEO_MODE=disabled`.

## Supabase

1. Usar el proyecto conectado y verificar que esté `ACTIVE_HEALTHY`.
2. Aplicar en orden `001_content_engine.sql`, `002_crm_and_jobs.sql`, `003_security_and_fk_indexes.sql`, `004_editorial_calendar.sql` y `005_admin_rls_hardening.sql`.
3. Confirmar el bucket privado `pixellabs-content`.
4. Configurar `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` solo en Render.
5. Ejecutar `npm run verify:supabase` dentro del entorno seguro.

Las cinco migraciones ya fueron aplicadas al proyecto enlazado durante la validación del 10 de agosto de 2026. No deben repetirse manualmente en ese mismo proyecto; `supabase_migrations.schema_migrations` es la referencia antes de cualquier cambio futuro.

## Activación segura

1. Desplegar con automatización apagada.
2. Probar subida y panel.
3. Importar n8n sin activar.
4. Conectar una plataforma mediante OAuth.
5. Probar borradores.
6. Mantener aprobación manual durante la etapa inicial.
