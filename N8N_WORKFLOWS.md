# Flujos n8n de PixelLabs

Los 12 JSON de `n8n/workflows/` son exportaciones importables para n8n
Community `2.33.7`. Todos conservan `active: false`, no contienen credenciales,
usan el API limitado `/automation`, envían una clave de idempotencia y aplican
tres intentos HTTP con espera de dos segundos.

Cada archivo mantiene su disparador manual o programado y añade `Prueba interna
controlada`, un `Execute Workflow Trigger` que permite validarlo mediante el CLI
sin publicar el workflow ni modificar su horario.

## Auditoría funcional

| # | Workflow | Disparador preparado | Función real | Datos o conexiones requeridos |
|---:|---|---|---|---|
| 1 | Investigación diaria | Diario, 06:00 | Ingresa observaciones autorizadas, deduplica y puntúa tendencias | `trend_sources`, `trends`, `trend_scores`, ajustes y catálogo |
| 2 | Plan editorial | Diario, 06:10 | Crea/reutiliza propuestas, respetando cantidades y formatos | Tendencias, catálogo, `content_ideas`, campañas y ajustes |
| 3 | Generación | Diario, 06:20 | Preparación diaria Gemini y espera humana | Catálogo, medios, Gemini Free Tier confirmado |
| 4 | Procesamiento de video | Manual | Encola el video para el agente local | `workflow_jobs`, videos y worker local; no FFmpeg en Render |
| 5 | Edición de clips | Manual | Encola un render para el agente local | Biblioteca de clips, versiones y worker local |
| 6 | Revisión múltiple | Diario, 06:30 | Revisa borradores nuevos en lote, ocho categorías | Contenido, catálogo, Gemini y ajustes |
| 7 | Corrección | Diario, 06:40 | Corrección segura en lote, preservando historial | Contenido, revisiones y `content_corrections` |
| 8 | Aprobación | Diario, 06:50 | Lista piezas para decisión humana; nunca aprueba | Biblioteca y revisiones |
| 9 | Programación/publicación | Cada 5 minutos | Consume solo simulaciones aprobadas | Calendario, nueva migración; cero solicitudes sociales |
| 10 | Métricas | Cada 6 horas | Guarda métricas propias/oficiales y genera resumen | `published_content`, `social_metrics`; cuentas oficiales pendientes |
| 11 | Optimización semanal | Lunes, 07:00 | Recomienda usando métricas, CRM, catálogo y biblioteca | Métricas, CRM, catálogo y contenido; no cambia ajustes automáticamente |
| 12 | Recuperación de errores | Cada 15 minutos | Lista fallos persistentes para revisión segura | `workflow_jobs`, `audit_logs`, `content_errors`; no reintenta publicación |

## Conexión segura

n8n necesita solamente:

- `PIXELLABS_API_URL=https://pixellabs-content-engine-free.onrender.com`.
- `PIXELLABS_N8N_API_TOKEN`, igual a `N8N_WEBHOOK_SECRET` de Render.
- `N8N_ENCRYPTION_KEY`, exclusiva de la instancia local.

El token de n8n es distinto de `ADMIN_API_TOKEN` y `LOCAL_WORKER_API_TOKEN`.
Cada solicitud usa HTTPS, Bearer dedicado, `X-PixelLabs-Workflow` y
`Idempotency-Key`. El backend rechaza un origen, flujo o token incorrecto, y
registra los estados `QUEUED`, `RUNNING`, `COMPLETED` y `FAILED` sin almacenar
payloads sensibles en auditoría.

n8n **no** recibe claves de Supabase. El backend de Render conserva la
`service_role`, consulta el bucket privado y conecta catálogo, CRM, radar,
calendario, contenido, revisiones, clips, métricas y cola persistente.

## Ejecución y errores

Los flujos encolan trabajo y consultan el estado después de cinco segundos. Un
estado `QUEUED` o `RUNNING` es seguimiento válido, no una publicación ni un
resultado final. Los trabajos ligeros tienen hasta tres intentos persistentes
con retroceso exponencial; video y clips quedan bajo el arrendamiento del worker
local. `audit_logs` registra cada transición y `content_errors` conserva los
fallos finales o reintentables con contexto no sensible. Los trabajos ligeros repiten espera/consulta hasta terminar. `FAILED` produce error explícito en n8n. Los de video salen del polling al asignarse a `local-video`; consultar su resultado en worker/panel.

La instalación local guarda ejecuciones siete días y conserva progreso. Los 12
flujos deben seguir **Inactive** hasta importar, configurar y probar cada uno
manualmente. El flujo 9 debe continuar apagado incluso después de esas pruebas,
hasta autorización expresa para otra fase.

## Validación

Auditoría actual del 6 de octubre de 2026 con n8n Community `2.33.7` real, aislada:

- importación y reexportación: 12/12 JSON válidos y 12/12 inactivos;
- ejecución controlada: 12/12 workflows completaron su recorrido n8n;
- backend aislado: 10 trabajos ligeros completados y 2 trabajos de video
  conservados en `QUEUED` para el worker local;
- seguridad: cero solicitudes IA/sociales, OAuth apagado y workflow 09 en dry-run;
- conexión real PC → Render → Supabase pendiente; no se modificó la instancia del usuario.

Los POST usan `specifyBody=json`, `JSON.stringify` y `Object.assign`. Runtime confirmó que keypair convierte payloads compuestos a texto y el evaluador de esta versión no resuelve object spread; la importación por sí sola no detecta esos fallos.

```bash
npm run build:n8n
npm run validate:n8n
# CLI Community 2.33.7 instalado, prueba aislada sin activar:
npm run test:n8n:runtime
```

La prueba oficial de importación usa:

```bash
n8n import:workflow --separate --input=/workflows
```

La opción recomendada ahora es n8n Community autohospedado en el PC de
PixelLabs: **$0/mes**. n8n Cloud Starter es de pago y no aporta una ventaja
necesaria en esta etapa.

La instalación guiada de Windows está en `n8n/local/CONFIGURAR-N8N.bat`. Además
de importar sin activar, ejecuta una comprobación de solo lectura contra
`/automation/readiness` desde el contenedor de n8n. Esa ruta valida el token
dedicado, HTTPS, catálogo, CRM, radar, calendario, biblioteca, revisiones,
clips, cola, auditoría, base de datos y Storage privado sin exponer la
`service_role` ni generar trabajos de prueba persistentes.

Activación posterior: 01 → 02 → 03 → 06 → 07 → 08 verificando cada resultado. 04/05 solo con worker validado en el PC. Después 09/10/11/12 con calendario/conexiones probados, sin cambiar payloads seguros para publicar. Los triggers usan `America/El_Salvador`; ajustar también n8n si se cambia la zona del motor.
