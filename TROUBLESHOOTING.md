# Solución de problemas

## El panel responde 503

Configura `ADMIN_API_TOKEN`. En producción también configura Supabase.

## El panel responde 401

Cierra sesión en el panel e introduce el token configurado en el servidor.

## El video falla como inválido

Comprueba extensión, MIME y que `ffprobe` pueda abrirlo. Un archivo con extensión MP4 no es necesariamente un MP4 válido.

## El procesamiento falla

Verifica `ffmpeg -version`, espacio de disco, memoria y permisos del directorio. Consulta el manifiesto de la subida y `content_errors`.

## n8n crea 401

Comprueba `PIXELLABS_API_URL` y `PIXELLABS_ADMIN_API_TOKEN`. No pegues el token en el JSON del flujo.

## Supabase no guarda

Confirma URL, service-role del proyecto correcto y que la migración fue aplicada. Nunca utilices la anon key como service-role.

Ejecuta `npm run verify:supabase`; la salida solo menciona nombres de tablas y no imprime credenciales.

## El webhook responde 503

En producción es obligatorio configurar `META_APP_SECRET` para verificar `X-Hub-Signature-256`.

## n8n encola pero no publica

Es el comportamiento inicial correcto. Confirma el resultado del trabajo: debe indicar `AUTO_PUBLISH_DISABLED` y cero solicitudes externas.

## Render pierde archivos

Comprueba que el disco esté montado exactamente en `/app/storage` y que `CONTENT_ENGINE_UPLOAD_DIR`/`CONTENT_ENGINE_WORK_DIR` apunten dentro de esa ruta.
