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

El esquema, las fuentes iniciales, la cola idempotente y el flujo n8n diario están listos. Falta conectar proveedores concretos de tendencias y el modelo de puntuación cuando se definan las APIs/costos autorizados.
