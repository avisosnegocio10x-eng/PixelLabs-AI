# Seguridad

## Cambios aplicados

- `.env` retirado del control de versiones y `.env.example` sin secretos.
- `node_modules` retirado del repositorio.
- API administrativa protegida con comparación de token en tiempo constante.
- Rate limiting y cabeceras Helmet.
- CORS cerrado por defecto.
- Límite de JSON y de fragmentos.
- Nombre de archivos saneado, UUID validado y formatos limitados.
- Respuestas y logs sin tokens.
- RLS y service-role solo backend.
- Firma `X-Hub-Signature-256` obligatoria para webhooks de Meta en producción.
- Mensajes y datos completos de clientes retirados de logs.
- Tokens OAuth cifrados con AES-256-GCM antes de persistirse.
- Tabla de tokens sin políticas de lectura para clientes autenticados.
- Docker excluye `.env`, almacenamiento local y dependencias del contexto de build.

## Acción obligatoria antes de producción

El repositorio ya contenía credenciales de correo dentro de `.env`. Aunque el archivo se elimine de la rama actual, esos valores pueden permanecer en el historial. Deben revocarse/rotarse desde el proveedor y reemplazarse en Render. No hace falta compartirlos conmigo.

Antes de desplegar debe configurarse `META_APP_SECRET`; sin él, los webhooks en producción responden `503` en vez de aceptar solicitudes sin firma.

## Secretos

Nunca incluir tokens en Git, frontend, capturas, logs o n8n exportado. Utilizar variables cifradas del proveedor y OAuth oficial.
