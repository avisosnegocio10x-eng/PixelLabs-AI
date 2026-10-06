# Continuación verificada — 2026-10-06

Repositorio `avisosnegocio10x-eng/PixelLabs-AI`, rama `agent/pixellabs-content-engine`. Base inspeccionada: `dfdda1fc55689badc98d828fbac25ae009545af6` (cinco commits previos también revisados), árbol `8c4b78ec2ceded4b9fdff4b0e51ce4a10dc5d4dc`. El checkout estaba limpio. Se conservó arquitectura, chatbot, cinco migraciones originales, worker y doce workflows.

**Resultado operativo actual:** preparación/editorial y calendario verificables en dry-run; todavía no publica diariamente en cuentas reales. No se desplegó, activó workflow, hizo post público, conectó una app real ni habilitó facturación. Costo de acciones realizadas: **$0**.

## Evidencia

[Reporte JSON](qa/2026-10-06.json) · [log completo de tests](qa/2026-10-06-check.txt) · [log de runtime n8n](qa/2026-10-06-n8n.txt).

- Baseline `npm run check`: 86/86. Después: 102/102, cero fallos, sintaxis y 12 JSON inactivos validados.
- E2E con proveedor simulado: tendencia propia → idea → copies diferentes → revisión fallida → corrección → nueva revisión → espera humana → aprobación → calendario → publicación simulada concurrente → métricas. Reintentos no duplican publicaciones.
- PostgreSQL PGlite: seis migraciones, nueva aplicada dos veces, RLS/permisos, cuota atómica, límites, leases, idempotencia y cambio de privacidad rechazado. Auth/Storage son fixtures, no servicios Supabase reales.
- n8n Community **2.33.7 real**: importación/exportación y ejecución 12/12. 0 activos, 10 trabajos ligeros completados, 2 de video en cola del worker, 0 llamadas IA/sociales. Reproducible con `npm run test:n8n:runtime`.
- FFmpeg/ffprobe reales en tests existentes: subidas/reanudación/checksum, análisis, clips/render/portadas, cola/heartbeat/reintentos del worker. Pendientes archivos reales largos y validación en PC del negocio.
- Panel: DOM y HTTP local validaron login, preview, aprobación, programación, edición que invalida aprobación y bloqueo de OAuth. No se validó render visual en navegador: descarga no disponible.
- Supabase: metadatos `ACTIVE_HEALTHY` y organización Free. Lecturas SQL/tablas/historial dieron timeout; no se ejecutó la migración remota.
- Render: Blueprint `plan: free`, sin disco, auto-deploy apagado. No se pudo verificar el dashboard ni revalidar disponibilidad remota; no se cambió ningún plan.

## Fase 1 — auditoría

**COMPLETADO:** rama/historial, archivos, documentación, configuración, cinco migraciones, arquitectura, 12 workflows y 86 tests originales inspeccionados. Detectados generación sin proveedor, publicación bloqueada, plan no idempotente y pérdida de correcciones por borrado de revisiones.
**PENDIENTE:** configuración efectiva remota.
**BLOQUEADORES:** acceso de lectura a DB y dashboard del despliegue.
**CREDENCIALES:** ninguna para auditoría del código.
**COSTO:** $0. **RIESGO:** bajo.
**SIGUIENTE PASO:** recuperar conexión segura al Supabase existente.

## Fase 2 — Supabase

**COMPLETADO:** adaptadores duales compatibles y migración incremental idempotente/RLS probada en PostgreSQL.
**PENDIENTE:** verificar historial real, tablas, índices, policies y bucket; aplicar únicamente migraciones pendientes y `npm run verify:supabase`.
**BLOQUEADORES:** lecturas del conector agotan timeout; sin claves seguras en el entorno de trabajo.
**CREDENCIALES:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; anon opcional.
**COSTO:** $0, Free confirmado por organización. **RIESGO:** medio al aplicar en remoto; bajo en QA aislado.
**SIGUIENTE PASO:** comprobar el proyecto existente antes de migrar; no recrearlo.

## Fase 3 — n8n

**COMPLETADO:** 12 importados y ejecutados inactivos en instancia aislada, payload/retries/polling/fallos/idempotencia corregidos.
**PENDIENTE:** instalación/conexión en PC con los scripts existentes; activar progresivamente 01→02→03→06→07→08 después de validar.
**BLOQUEADORES:** PC y backend real no accesibles desde esta sesión.
**CREDENCIALES:** `N8N_WEBHOOK_SECRET`, `PIXELLABS_API_URL`, `PIXELLABS_N8N_API_TOKEN`, `N8N_ENCRYPTION_KEY`.
**COSTO:** $0 Community local. **RIESGO:** bajo mientras permanezcan inactivos.
**SIGUIENTE PASO:** `n8n/local/CONFIGURAR-N8N.bat` y readiness desde el contenedor.

## Fase 4 — video/worker

**COMPLETADO:** tests reales FFmpeg/ffprobe y worker existente sin reconstrucción; procesamiento pesado no se habilitó en Render.
**PENDIENTE:** PC, archivos largos propios, sincronización real y relación clip/producto.
**BLOQUEADORES:** acceso al PC, medios reales y Storage conectado.
**CREDENCIALES:** `LOCAL_WORKER_API_TOKEN`, `LOCAL_WORKER_API_URL`.
**COSTO:** $0 cloud adicional. **RIESGO:** bajo en local.
**SIGUIENTE PASO:** procesar un clip real; luego habilitar 04/05.

## Fase 5 — Meta

**COMPLETADO:** Facebook Login único, scopes, Página/Instagram vinculados, callbacks con estado de un uso, bóveda cifrada y contratos de clientes oficiales probados con mocks.
**PENDIENTE:** OAuth real, permisos, compatibilidad de formatos y ciclo de vida real del token.
**BLOQUEADORES:** app/cuentas y configuración segura; no se alteró Messenger.
**CREDENCIALES:** `META_APP_ID`, `META_APP_SECRET`, `META_GRAPH_API_VERSION`, `FACEBOOK_PAGE_ID`, URL/callback; Instagram ID opcional.
**COSTO:** $0 sin servicios nuevos. **RIESGO:** medio al conectar cuentas; publicación bloqueada.
**SIGUIENTE PASO:** registrar callback y probar lectura/consentimiento sin publicar.

## Fase 6 — TikTok

**COMPLETADO:** OAuth `video.upload`, refresh cifrado, draft/transportes y consulta de métricas preparados; Direct Post bloqueado.
**PENDIENTE:** Developer App, scopes, OAuth real y dominio/prefijo verificado si se usa URL.
**BLOQUEADORES:** cuenta/app y auditoría para futura publicación directa.
**CREDENCIALES:** `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI`; prefijo de medios si corresponde.
**COSTO:** $0. **RIESGO:** medio en conexión real.
**SIGUIENTE PASO:** conectar upload/draft; no pedir Direct Post inicialmente.

## Fase 7 — pipeline dry-run

**COMPLETADO:** E2E completo, variantes, ocho revisiones, corrección, cuotas, reintentos y simulación concurrente.
**PENDIENTE:** prueba Gemini con clave de Free Tier, medios del negocio y fuentes de tendencias autorizadas.
**BLOQUEADORES:** clave/confirmación de proyecto sin billing y medios propios.
**CREDENCIALES:** `GEMINI_API_KEY` y bandera de Free Tier confirmado.
**COSTO:** $0 en QA con mocks. **RIESGO:** bajo.
**SIGUIENTE PASO:** generar un día real como borradores, sin publicación.

## Fase 8 — aprobación en panel

**COMPLETADO:** preview, copy/hashtags/plataforma/producto/estrategia/score/hora; aprobar, editar, regenerar, rechazar y programar simulación; edición invalida aprobación.
**PENDIENTE:** QA visual en navegador y revisión del usuario con medios reales.
**BLOQUEADORES:** entorno desplegado conectado y assets.
**CREDENCIALES:** `ADMIN_API_TOKEN`.
**COSTO:** $0. **RIESGO:** bajo.
**SIGUIENTE PASO:** aprobación manual de una pieza del negocio y simulación a la hora elegida.

## Fases 9, 10 y 11 — pruebas reales

| Fase | COMPLETADO | PENDIENTE | BLOQUEADORES | CREDENCIALES | COSTO | RIESGO | SIGUIENTE PASO |
|---|---|---|---|---|---|---|---|
| 9 Facebook | Cliente y mocks | Prueba real controlada | Cuenta/OAuth y autorización explícita de QA | Token Página cifrado vía OAuth | $0 previsto | Medio | Preparar pieza concreta y solicitar autorización final |
| 10 Instagram | Contenedores/carrusel y mocks | Prueba real controlada | Cuenta profesional, URL y autorización QA | Token/ID Instagram vía OAuth | $0 previsto | Medio | Verificar contenedor y publicar solo tras autorización |
| 11 TikTok | Upload/draft y mocks | Prueba de borrador o privada | App/scopes, medio y autorización QA | Access/refresh/open_id vía OAuth | $0 previsto | Medio | Enviar draft autorizado y finalizar en TikTok |

No se ejecutó ninguna de estas pruebas. El calendario actual solo consume dry-run; todavía falta conectar el publicador real y su confirmación de estados. No basta con cambiar una bandera.

## Fase 12 — métricas

**COMPLETADO:** almacenamiento normalizado (incluye impresiones y engagement calculado con base declarada), snapshots sin doble conteo, exclusión de simulaciones y comparaciones de formato/producto/hook/tema/duración/CTA/red/día/hora desde metadatos disponibles.
**PENDIENTE:** extracción automática real Meta/Instagram y sincronización completa TikTok; datos de mensajes/cotizaciones/ventas atribuidos desde CRM.
**BLOQUEADORES:** publicaciones confirmadas y permisos efectivos de las cuentas.
**CREDENCIALES:** tokens oficiales vía OAuth; `video.list` para TikTok y permisos Insights de Meta solo cuando resulten necesarios.
**COSTO:** $0 previsto dentro de límites Free. **RIESGO:** bajo para lectura.
**SIGUIENTE PASO:** recuperar métricas reales sin inventar campos no disponibles.

## Fase 13 — optimización semanal

**COMPLETADO:** recomendaciones con razones/evidencia, ranking comercial y comparaciones con muestra mínima; propuestas requieren revisión humana. Resultado queda en el trabajo persistente; `automaticSettingsChanged=false`.
**PENDIENTE:** semana de datos reales y validación de atribución comercial.
**BLOQUEADORES:** métricas reales todavía inexistentes en esta sesión.
**CREDENCIALES:** ninguna adicional a la conexión de métricas.
**COSTO:** $0 análisis local. **RIESGO:** bajo; no cambia reglas.
**SIGUIENTE PASO:** revisar recomendaciones semanalmente, aprobar ajustes por separado.

## Fase 14 — autonomía total

**COMPLETADO:** bloqueo de `AUTO_PUBLICATION`, modos avanzados y automatización por plataforma.
**PENDIENTE:** evaluación después de estabilidad real; fuera de la activación actual.
**BLOQUEADORES:** fases reales pendientes y falta de autorización expresa.
**CREDENCIALES:** ninguna nueva.
**COSTO:** $0, no activada. **RIESGO:** alto si se activara prematuramente.
**SIGUIENTE PASO:** conservar aprobación humana.

## Retomar sin perder estado

1. Configurar únicamente las [credenciales exactas](CONTENT_ENGINE_CREDENTIALS.md) en entornos seguros existentes.
2. Recuperar DB y verificar migraciones/bucket; mantener Free y no crear recursos nuevos.
3. Desplegar la rama revisada al servicio Free existente cuando corresponda; no usar `render.yaml` pagado.
4. Conectar n8n/worker del PC y generar borradores con assets reales.
5. Validar preview → aprobación → simulación. Preparar QA público concreto solo cuando las cuentas estén conectadas y el usuario autorice esa publicación.
