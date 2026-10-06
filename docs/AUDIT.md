# Auditoría inicial — 2026-08-06

## Encontrado

- Chatbot Node/Express en producción temprana.
- Integraciones directas con Gemini, Meta y Gmail.
- Conversaciones guardadas en JSON local y sin CRM duradero.
- Panel público sin autenticación.
- `.env` y 1,173 archivos de `node_modules` versionados.
- Sin Supabase, n8n, catálogo normalizado, colas ni pruebas.
- `ffmpeg` y `ffprobe` disponibles en el entorno de desarrollo.

## Conservado

- Webhook y comportamiento actual del chatbot.
- Conocimientos de negocio y flujo de cotización.
- Panel existente, ampliado en lugar de reemplazar el backend.

## Riesgos pendientes

- Rotación de secretos históricos.
- OAuth y revisión de apps sociales.
- Worker de video separado para cargas largas en producción.
- Pruebas de integración con archivos y cuentas reales.

## Actualización — 2026-08-10

- Supabase conectado y cinco migraciones aplicadas sin avisos de seguridad.
- Chatbot/CRM, catálogo, contenido, calendario, métricas y trabajos tienen adaptadores Supabase con fallback local.
- Firma SHA-256 de webhooks implementada y probada; producción falla de forma segura si falta `META_APP_SECRET`.
- Radar, calendario, corrección segura y métricas dejaron de ser handlers simulados.
- Los 12 flujos n8n conservan payload, encolan con idempotencia, esperan y consultan el resultado; siguen inactivos.
- Sigue pendiente configurar el backend desplegado con variables de Supabase, autorizar n8n y completar OAuth social.

## Continuación — 2026-10-06

Se retomó el checkout limpio de `dfdda1f`, sin recrear Content Engine, chatbot, worker ni workflows. Baseline 86 tests; resultado 102/102. Generación Gemini Free Tier, aprobación manual obligatoria, previews/uploads de fotos, corrección con historial, scheduler dry-run y OAuth oficial preparados. Los 12 workflows pasaron en n8n Community 2.33.7 aislado e inactivo.

Los registros de Supabase/Render de agosto son históricos: las consultas SQL actuales agotaron timeout y no se confirmó la configuración efectiva remota. Organización Supabase Free verificada por metadatos; nueva migración probada localmente, no aplicada al proyecto real. No se habilitó billing, publicación pública ni auto-publicación. [Estado completo y siguiente paso por fase](CONTENT_ENGINE_PHASES.md).
