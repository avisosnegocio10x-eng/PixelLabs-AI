# Base de datos

Las migraciones están en:

- `database/migrations/001_content_engine.sql`: 30 entidades originales del Content Engine.
- `database/migrations/002_crm_and_jobs.sql`: CRM, trabajos persistentes y bóveda cifrada de tokens sociales.
- `database/migrations/003_security_and_fk_indexes.sql`: endurecimiento de funciones/RLS y cobertura de todas las claves foráneas.
- `database/migrations/004_editorial_calendar.sql`: fecha, plataforma, idempotencia y restricciones del plan editorial.
- `database/migrations/005_admin_rls_hardening.sql`: función administrativa sin privilegios elevados y políticas RLS optimizadas.

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
- `is_content_admin()` y `set_updated_at()` son `SECURITY INVOKER` con `search_path` fijo.
- Todas las claves foráneas simples tienen un índice de cobertura.
- El calendario impide dos propuestas activas de la misma plataforma en el mismo minuto.

## Aplicar

Ejecuta `001`, `002`, `003`, `004` y `005` en ese orden mediante migraciones de Supabase. Después ejecuta `npm run verify:supabase` desde un entorno que ya tenga las variables configuradas. No pegues la service-role en el chat ni en el frontend.

## Verificación real del 10 de agosto de 2026

- 5 migraciones registradas.
- 36 tablas públicas y RLS habilitado en todas.
- 36 políticas; los tokens tienen una política de denegación explícita y privilegios revocados.
- 55 claves foráneas válidas y 0 sin índice de cobertura.
- Bucket `pixellabs-content` privado.
- 0 avisos del asesor de seguridad.
- Prueba transaccional de tendencia, calendario, publicación confirmada y métricas aprobada y revertida; 0 datos de prueba persistieron.

Los avisos de índices “sin uso” se conservan durante el arranque: una base recién creada no tiene historial suficiente para decidir que un índice sobra.
