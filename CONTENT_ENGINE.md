# Content Engine

## Configuración inicial

- Objetivo inicial nuevo: 1 pieza por plataforma/día (Facebook, Instagram y TikTok).
- Hasta 1 estática y 1 reel entre Facebook/Instagram; TikTok tiene su objetivo separado.
- Carruseles configurables; Stories pospuestas hasta verificar soporte de la cuenta/API.
- Aprobación manual.
- Publicación automática global, Facebook, Instagram y TikTok: apagadas.
- Puntaje 95 para posible aprobación automática y 85 para revisión humana.

Las cantidades son máximos, no una obligación de rellenar espacios con contenido defectuoso. Los ajustes ya persistidos se conservan. La aprobación automática permanece bloqueada, incluso con puntuación 95.

## Decisión de contenido

`contentDecisionService` exige las ocho revisiones. Bloquea automáticamente:

- Producto agotado.
- Datos comerciales sin confirmar.
- Riesgo de privacidad.
- Riesgo legal alto.
- Marca de agua de terceros.
- Contenido duplicado.
- Puntuación insuficiente.

Las tendencias nuevas requieren aprobación humana, aunque superen 95 puntos.

## Interrupción

`POST /admin/api/content-engine/emergency-stop` apaga el motor y `autoPublish` en una sola operación. La guardia vuelve a comprobar el interruptor inmediatamente antes de publicar.

## Catálogo y contenido

- Búsqueda por referencia o nombre.
- Estados `AVAILABLE`, `LOW_STOCK`, `OUT_OF_STOCK`, `PAUSED` y `ARCHIVED`.
- Bloqueo de promoción configurable; el panel ofrece 15 días.
- Acciones para ideas, reel y carrusel se encolan con idempotencia.
- Un producto no disponible no puede generar borrador ni aprobarse.
- El precio solo se considera confirmado si existe `price_confirmed_at`.

## Aprobación

Un contenido nace `DRAFT`, recibe las ocho revisiones y pasa a `REQUIRES_HUMAN_APPROVAL` (estado existente equivalente a `awaiting_approval`). Solo la ruta administrativa de aprobación puede convertirlo en `APPROVED`. La exportación social devuelve otra variante `DRAFT`; no equivale a publicar.

Cada una de las ocho revisiones debe superar el umbral humano. `NEEDS_CORRECTION` → corrección segura registrada → `UNDER_REVIEW` → nueva revisión → espera humana. Se conservan revisiones y correcciones anteriores. Editar invalida aprobación, puntaje y variantes preparadas.

## Preparación diaria — actualización 2026-10-06

**Preparar el día** y el workflow 03 ejecutan plan → Gemini → variantes por plataforma → ocho revisiones → corrección segura → espera humana. Repetir el día reutiliza ideas/borradores sin nuevas llamadas para contenido revisado. Respeta horarios, zona, días activos y límites por plataforma/formato.

La IA está apagada por defecto. Requiere `GEMINI_API_KEY`, `CONTENT_ENGINE_AI_ENABLED=true` y `CONTENT_ENGINE_GEMINI_FREE_TIER_CONFIRMED=true` después de comprobar que el proyecto no tiene billing. Modelos Lite actuales definidos en `.env.example`; sin fallback pagado, imágenes, video generativo ni grounding. Cuota persistente inicial: 12 solicitudes/día UTC. Se detiene al agotarse.

El panel muestra preview, copy, plataforma, producto, estrategia, puntaje y hora; permite aprobar, editar, regenerar, rechazar, revisar, adjuntar foto y programar una **simulación**. Las fotos propias PNG/JPEG/WebP tienen límite de 8 MiB. Video conserva el worker existente. La IA revisa texto/metadatos; el humano confirma visualmente el medio al aprobar.

El calendario usa las tablas existentes `content_variants`, `content_schedule`, `publication_attempts` y `published_content`. Solo acepta `dry-run`, marcado `is_simulated=true` y excluido del aprendizaje. Comprueba nuevamente aprobación/fingerprint, motor, stock, producto y medios al consumir; aplica límites diarios y 15 minutos mínimos por cuenta. No hay ruta de publicación real operativa habilitada.

La investigación externa automática aún requiere fuentes oficiales/RSS autorizadas configuradas. El radar admite observaciones propias/manuales; Gemini no presenta ideas inferidas como tendencias actuales verificadas. Estado y conexiones pendientes: [reporte por fases](docs/CONTENT_ENGINE_PHASES.md).

## Operaciones editoriales

- El radar acepta lotes manuales, datos propios, RSS o APIs autorizadas, normaliza la fuente y deduplica por SHA-256.
- La puntuación combina relevancia, potencial de mensajes/ventas, disponibilidad y originalidad, restando riesgo legal, desinformación y dificultad.
- El planificador usa las cantidades y horarios editables, rota `product`, `educational`, `trend`, `process` y `question`, respeta días de descanso y desplaza cinco minutos cualquier colisión.
- Los espacios se guardan como `content_ideas.status = PROPOSED`; no crean una publicación ni cambian `autoPublish`.
- Las métricas se optimizan en este orden: ingresos, ventas, cotizaciones, mensajes y finalmente visualizaciones.
- La corrección automática solo normaliza espacios y puntuación de textos. Riesgos visuales, privacidad, originalidad, técnicos, copyright, marcas, producto agotado o datos sin confirmar se derivan a una persona.
