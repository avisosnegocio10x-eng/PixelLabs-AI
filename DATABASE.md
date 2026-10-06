# Base de datos

Las migraciones están en:

- `database/migrations/001_content_engine.sql`: 30 entidades originales del Content Engine.
- `database/migrations/002_crm_and_jobs.sql`: CRM, trabajos persistentes y bóveda cifrada de tokens sociales.
- `database/migrations/003_security_and_fk_indexes.sql`: endurecimiento de funciones/RLS y cobertura de todas las claves foráneas.
- `database/migrations/004_editorial_calendar.sql`: fecha, plataforma, idempotencia y restricciones del plan editorial.
- `database/migrations/005_admin_rls_hardening.sql`: función administrativa sin privilegios elevados y políticas RLS optimizadas.
- `database/migrations/20261006000920_content_pipeline.sql`: cuotas Gemini, calendario de simulación, leases, aprobación/idempotencia, impresiones y marca de simulación; creada con `supabase migration new`.

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

En una instalación nueva, aplica `001` → `002` → `003` → `004` → `005` → `20261006000920_content_pipeline.sql`. En el proyecto existente, revisa primero historial/esquema: no reapliques a ciegas las cinco originales. Si ya están registradas, aplica solo la nueva. Después ejecuta `npm run verify:supabase` con las claves en el entorno seguro. No pegues service-role en chat/frontend.

La nueva migración es transaccional e idempotente. Añade `content_ai_usage` con RLS y sin permisos anon/authenticated; cuatro RPC `SECURITY INVOKER`, `search_path` fijo y ejecución solo por service-role. Locks/`SKIP LOCKED` protegen cuota, límites y consumo concurrente. No habilita publicación ni recursos pagados.

## Comprobación actual — 2026-10-06

Metadatos del proyecto `xhihiclbhzoyurvfxyce`: `ACTIVE_HEALTHY`; organización **Free**. Las consultas SQL, tablas e historial agotaron su timeout. No se aplicó la nueva migración ni se confirmó el esquema remoto actual.

Las seis migraciones pasaron sobre PostgreSQL PGlite, con reaplicación de la nueva, RLS/permisos, cuotas, aprobación, límites, leases, idempotencia y rechazo al cambiar privacidad del medio. El harness simula `auth`/`storage` y omite instalación de `pgcrypto`: no sustituye validar Supabase real.

## Verificación real del 10 de agosto de 2026

Registro histórico conservado; no revalidado en la sesión actual.

- 5 migraciones registradas.
- 36 tablas públicas y RLS habilitado en todas.
- 36 políticas; los tokens tienen una política de denegación explícita y privilegios revocados.
- 55 claves foráneas válidas y 0 sin índice de cobertura.
- Bucket `pixellabs-content` privado.
- 0 avisos del asesor de seguridad.
- Prueba transaccional de tendencia, calendario, publicación confirmada y métricas aprobada y revertida; 0 datos de prueba persistieron.

Los avisos de índices “sin uso” se conservan durante el arranque: una base recién creada no tiene historial suficiente para decidir que un índice sobra.
