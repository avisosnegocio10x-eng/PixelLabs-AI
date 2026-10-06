# APIs sociales

Actualización 2026-10-06 sobre los adaptadores existentes. Publicación real deshabilitada. OAuth es un permiso independiente, apagado por defecto; su conexión real está pendiente.

## TikTok

La Content Posting API oficial permite videos y fotos. Publicación directa requiere una app registrada, Direct Post, aprobación de `video.publish` y autorización del usuario. Los clientes no auditados quedan limitados a visibilidad privada. La subida de borrador utiliza `video.upload` y exige que el propietario termine el flujo dentro de TikTok. El sistema implementa ambos clientes, pero no los expone para publicación mientras el modo sea `draft`.

La vía `draft-upload` exige que la persona termine el flujo desde la notificación
de TikTok.

Fuente oficial: https://developers.tiktok.com/doc/content-posting-api-get-started

## Instagram

Se seleccionó **Instagram API with Facebook Login**, porque el proyecto ya usa Graph API, Messenger y una Página. La cuenta Business/Creator debe estar vinculada a esa Página. Se preparan imágenes, carruseles de 2–10 elementos y Reels; Stories permanecen pospuestas hasta verificar soporte real. La API requiere medios HTTPS accesibles y controlados.

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

Todo cliente oficial exige simultáneamente `SOCIAL_PUBLISH_MODE=live`,
`SOCIAL_EXTERNAL_REQUESTS_ENABLED=true`, habilitación explícita en la instancia y
un identificador de aprobación humana. Si falta una sola condición, lanza
`SOCIAL_OUTBOUND_DISABLED` antes de llegar a la red. La configuración validada de
producción actual exige `draft` y `false`, por lo que estas llamadas son
inalcanzables en Render.

## Estado técnico

- `GET /admin/api/content-engine/social/capabilities` informa requisitos sin exponer secretos.
- `POST /admin/api/content-engine/content/:id/export/:platform` crea una variante `DRAFT` solo si el contenido fue aprobado y el producto sigue disponible.
- Los clientes oficiales están en `src/contentEngine/social/officialApiClients.js` y todavía no son llamados por rutas públicas.
- Los tokens se almacenan con AES-256-GCM en `social_account_tokens`; no se guardan en JSON de n8n ni se devuelven al frontend.

## OAuth preparado

`POST /admin/api/content-engine/social/oauth/:provider/start` (`meta`/`tiktok`) requiere `SOCIAL_OAUTH_ENABLED=true` y clave de cifrado válida. Callbacks: `/social/oauth/meta/callback` y `/social/oauth/tiktok/callback`. Estado firmado de un uso y duración 10 minutos; persistencia antes de intercambiar tokens.

Meta solicita `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`. Comprueba la Página configurada y obtiene el Instagram vinculado. No sobrescribe `PAGE_ACCESS_TOKEN` del chatbot. La expiración/renovación real de Meta debe verificarse antes de operación diaria.

TikTok empieza con `user.info.basic`, `video.upload`, `video.list`; almacena access/refresh token, expiraciones y `open_id`. La renovación está implementada y probada con mocks, sin scheduler de renovación real. No solicita `video.publish` inicialmente. Direct Post exige auditoría, privacidad compatible y consentimiento; no es accesible desde el calendario de simulación. El upload a borrador exige terminar dentro de TikTok.

`PULL_FROM_URL` exige HTTPS y `TIKTOK_VERIFIED_MEDIA_URL_PREFIX` verificado con TikTok. `FILE_UPLOAD` tiene transporte oficial preparado. Facebook Reels usa `rupload.facebook.com`; los clientes sanitizan errores y no siguen redirecciones con tokens. Instagram conserva creación y publicación del contenedor como pasos separados.

TikTok tiene consulta Display API con `video.list` preparada. La sincronización autónoma Meta/Instagram y la conexión de estos clientes al scheduler real siguen pendientes. Tests con respuestas simuladas no equivalen a apps registradas o permisos aprobados. [Credenciales exactas](docs/CONTENT_ENGINE_CREDENTIALS.md).
