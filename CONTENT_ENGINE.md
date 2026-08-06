# Content Engine

## Configuración inicial

- 4 publicaciones estáticas por día.
- 2 historias por día.
- 1 reel por día.
- Aprobación manual.
- Publicación automática global, Facebook, Instagram y TikTok: apagadas.
- Puntaje 95 para posible aprobación automática y 85 para revisión humana.

Las cantidades son máximos, no una obligación de rellenar espacios con contenido defectuoso.

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

Un contenido nace `DRAFT`, recibe las ocho revisiones y pasa a `REQUIRES_HUMAN_APPROVAL`. Solo la ruta administrativa de aprobación puede convertirlo en `APPROVED`. La exportación social devuelve otra variante `DRAFT`; no equivale a publicar.
