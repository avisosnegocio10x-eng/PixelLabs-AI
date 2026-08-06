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
- Persistencia del chatbot en Supabase.
- Firma de webhooks.
- OAuth y revisión de apps sociales.
- Worker de video separado para cargas largas en producción.
- Pruebas de integración con archivos y cuentas reales.
