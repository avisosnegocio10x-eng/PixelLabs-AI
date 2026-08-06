# Base de datos

Las migraciones están en:

- `database/migrations/001_content_engine.sql`: 30 entidades originales del Content Engine.
- `database/migrations/002_crm_and_jobs.sql`: CRM, trabajos persistentes y bóveda cifrada de tokens sociales.

Incluye las 30 entidades solicitadas: configuración, cuentas sociales, tendencias y puntuaciones, catálogo, medios, campañas, ideas, contenidos y variantes, ocho revisiones, correcciones, calendario, intentos, publicaciones, métricas, atribución, videos, segmentos, transcripciones, momentos, clips, versiones, errores y auditoría.

## Garantías

- UUIDs y claves foráneas.
- Índices para colas, calendario, biblioteca y métricas.
- Unicidad por fingerprints, referencias e idempotencia.
- Restricciones de estados y puntuaciones.
- RLS en todas las tablas.
- Políticas reservadas a usuarios con rol `owner` o `admin` en `app_metadata`.
- La service-role se usa solo en backend.
- Timestamps automáticos.
- CRM deduplicado por plataforma/ID externo y mensajes deduplicados por ID del proveedor.
- Cola con idempotencia por tipo de flujo y clave.
- Bucket privado `pixellabs-content` creado desde la migración cuando Supabase Storage está disponible.
- La tabla `social_account_tokens` no concede acceso a usuarios autenticados; solo la service-role puede guardar el texto cifrado.

## Aplicar

Ejecuta primero `001` y luego `002` mediante Supabase CLI o el editor SQL del proyecto correcto. Después ejecuta `npm run verify:supabase` desde un entorno que ya tenga las variables configuradas. No pegues la service-role en el chat ni en el frontend.
