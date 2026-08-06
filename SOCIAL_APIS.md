# APIs sociales

Verificación realizada el 6 de agosto de 2026. Ninguna publicación real está habilitada.

## TikTok

La Content Posting API oficial permite subir videos y fotos. Publicación directa requiere una app registrada, habilitar Direct Post, aprobación del permiso `video.publish` y autorización del usuario. Los clientes no auditados quedan limitados a visibilidad privada. La subida de borrador utiliza `video.upload` y exige que el usuario termine el flujo en TikTok.

Fuente oficial: https://developers.tiktok.com/doc/content-posting-api-get-started

## Instagram

La Content Publishing API de Meta admite el flujo de contenedor, carga y publicación para cuentas profesionales compatibles. Se necesita una app de Meta, cuenta profesional vinculada, permisos aprobados y token válido. Reels y audio tienen requisitos propios.

Fuentes oficiales:

- https://developers.facebook.com/docs/instagram-platform/content-publishing/
- https://developers.facebook.com/docs/instagram-platform/content-publishing/audio-api/

## Facebook

Las publicaciones de Página y Reels usan Graph/Video API con token de Página y permisos aprobados. La versión de Graph debe definirse mediante `META_GRAPH_API_VERSION` y validarse al conectar la cuenta; no se fija como capacidad eterna.

Fuentes oficiales:

- https://developers.facebook.com/docs/pages-api/posts/
- https://developers.facebook.com/docs/video-api/guides/reels-publishing/

## Regla de integración

Si una cuenta o formato no supera la verificación de capacidades, el sistema generará archivo, portada y descripción como borrador para publicación manual. Jamás interpretará una solicitud aceptada como publicación confirmada sin consultar su estado.
