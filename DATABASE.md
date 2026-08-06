# Base de datos

La migración está en `database/migrations/001_content_engine.sql`.

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

## Aplicar

Ejecuta la migración mediante Supabase CLI o el editor SQL del proyecto correcto. Antes confirma que sea el proyecto de PixelLabs. No pegues la service-role en el chat ni en el frontend.
