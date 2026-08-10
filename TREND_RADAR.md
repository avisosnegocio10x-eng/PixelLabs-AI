# Radar de tendencias

## Fuentes permitidas

- Datos propios del catálogo, CRM, mensajes y ventas.
- APIs oficiales y RSS que permitan automatización.
- Calendario comercial y eventos públicos.
- Enlaces añadidos manualmente por el propietario.

No se implementará scraping que viole términos, eluda accesos o descargue contenido de terceros para republicarlo.

## Flujo de evaluación

Normalizar fuente, calcular fingerprint, eliminar duplicados, puntuar los 13 factores definidos en `trend_scores`, verificar riesgo legal y seleccionar solo tendencias por encima de `minimumTrendScore`.

La fuente queda guardada para auditoría interna. El contenido final debe usar fotografías propias, archivos autorizados o material generado para PixelLabs.

## Estado de implementación

- `TrendRadarService` acepta hasta 100 observaciones, valida fuentes y URLs, limita el texto guardado y conserva solo señales seguras en el snapshot.
- La puntuación determinista está activa, aplica umbral configurable y rechaza automáticamente riesgos legales o de desinformación altos.
- El repositorio local y Supabase deduplican tendencias y guardan el historial de puntuación.
- El panel permite registrar una observación propia y consultar candidatas.
- El flujo n8n diario puede recibir observaciones de una fuente autorizada y devuelve candidatas; permanece inactivo.

Pendiente: escoger y autorizar proveedores externos concretos. Hasta entonces no se hace scraping ni se inventa una fuente.
