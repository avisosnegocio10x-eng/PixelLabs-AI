# APIs sociales

Verificación realizada el 6 de agosto de 2026 contra documentación oficial. Ninguna publicación real está habilitada.

## TikTok

La Content Posting API oficial permite videos y fotos. Publicación directa requiere una app registrada, Direct Post, aprobación de `video.publish` y autorización del usuario. Los clientes no auditados quedan limitados a visibilidad privada. La subida de borrador utiliza `video.upload` y exige que el propietario termine el flujo dentro de TikTok. El sistema implementa ambos clientes, pero no los expone para publicación mientras el modo sea `draft`.

Fuente oficial: https://developers.tiktok.com/doc/content-posting-api-get-started

## Instagram

La Content Publishing API de Meta admite imágenes, videos, Reels, Stories y carruseles para cuentas profesionales compatibles. Se necesita app, cuenta profesional, permisos, token y una URL pública del archivo. Meta documenta un límite móvil de 100 publicaciones API por 24 horas para Instagram; los carruseles cuentan como una.

Fuentes oficiales:

- https://developers.facebook.com/docs/instagram-platform/content-publishing/
- https://developers.facebook.com/docs/instagram-platform/content-publishing/audio-api/

## Facebook

Las publicaciones de Página usan Pages API y los Reels un flujo separado de Video API con sesión de subida. Se requiere token de Página y permisos aprobados. Marketplace y perfiles personales quedan fuera. La versión debe definirse mediante `META_GRAPH_API_VERSION` y validarse al conectar la cuenta; no se fija como capacidad eterna.

Fuentes oficiales:

- https://developers.facebook.com/docs/pages-api/posts/
- https://developers.facebook.com/docs/video-api/guides/reels-publishing/

## Regla de integración

Si una cuenta o formato no supera la verificación de capacidades, el sistema generará archivo, portada y descripción como borrador para publicación manual. Jamás interpretará una solicitud aceptada como publicación confirmada sin consultar su estado.

## Estado técnico

- `GET /admin/api/content-engine/social/capabilities` informa requisitos sin exponer secretos.
- `POST /admin/api/content-engine/content/:id/export/:platform` crea una variante `DRAFT` solo si el contenido fue aprobado y el producto sigue disponible.
- Los clientes oficiales están en `src/contentEngine/social/officialApiClients.js` y todavía no son llamados por rutas públicas.
- Los tokens se almacenarán cifrados; no se guardarán dentro de los JSON de n8n.
