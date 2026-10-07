# Credenciales y configuración exactas

Los nombres coinciden con `.env.example`, `n8n/local/config.example.env` y el código. Introducir secretos en variables seguras del backend/PC, nunca en Git, frontend, logs o chat. No activar billing ni crear recursos pagados.

En Windows, `INSTALAR-PIXELLABS.bat` genera los cinco secretos locales sin tocar las credenciales del chatbot. `CONFIGURAR-CREDENCIALES.bat` permite introducir los datos reales con entrada oculta. [Guía del perfil offline](WINDOWS_INSTALLER.md). Para comprobar/aplicar migraciones, `SUPABASE_DB_URL` requiere la contraseña PostgreSQL de **Connect**; la service-role solo permite comprobar la API/Storage.

## Supabase — proyecto existente Free

- [ ] `SUPABASE_URL`
- [ ] `SUPABASE_SERVICE_ROLE_KEY` — solo backend; no entregar a n8n/worker/frontend.
- [ ] `SUPABASE_ANON_KEY` — opcional por compatibilidad, no usada por este backend.
- [ ] `SUPABASE_STORAGE_BUCKET=pixellabs-content` — configuración, bucket privado.
- [ ] `REQUIRE_SUPABASE=true` en producción.

Restaurar consultas del proyecto `xhihiclbhzoyurvfxyce`, comprobar historial/RLS/índices/bucket y aplicar solo migraciones pendientes. No crear otro proyecto ni subir a Pro. La nueva migración aún no se aplicó al proyecto remoto.

## Gemini — proyecto sin billing

- [ ] `GEMINI_API_KEY` — nombre existente compartido; no reemplazar la clave/modelo del chatbot sin revisar compatibilidad.
- [ ] Confirmar que la clave pertenece a un proyecto sin facturación.
- [ ] `CONTENT_ENGINE_GEMINI_FREE_TIER_CONFIRMED=true` solo tras esa comprobación.
- [ ] `CONTENT_ENGINE_AI_ENABLED=true` solo para probar generación con cuota gratuita.
- [ ] `CONTENT_ENGINE_GEMINI_MODEL=gemini-3.5-flash-lite` (alternativa permitida `gemini-3.1-flash-lite`).
- [ ] `CONTENT_ENGINE_GEMINI_MAX_REQUESTS_PER_DAY=12` — máximo local persistente, día UTC.

Modelos comprobados en documentación oficial de Google el 6/10/2026. No hay proveedor alternativo pagado, grounding, imágenes ni video IA. Confirmar disponibilidad/cuota de la cuenta antes de activar; un 429 detiene la generación.

## Meta — un solo flujo Facebook Login

- [ ] `META_APP_ID`
- [ ] `META_APP_SECRET` — coordinar con el webhook existente; no sustituir su app en producción sin comprobarlo.
- [ ] `META_GRAPH_API_VERSION` — versión soportada elegida desde el dashboard/documentación oficial; no asumir una fija.
- [ ] `FACEBOOK_PAGE_ID`
- [ ] `INSTAGRAM_BUSINESS_ACCOUNT_ID` — opcional si se detecta la cuenta vinculada; sirve para exigir la cuenta esperada.
- [ ] `APP_BASE_URL` — URL HTTPS existente del backend.
- [ ] `META_REDIRECT_URI` — opcional; por defecto `${APP_BASE_URL}/social/oauth/meta/callback`. Registrar exactamente esa URL.
- [ ] Página administrada por el usuario y cuenta Instagram Business/Creator vinculada.
- [ ] Permisos `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`; roles/app review según corresponda.

El Page Access Token se obtiene mediante OAuth y queda cifrado. **No existen variables nuevas `META_PAGE_ACCESS_TOKEN` ni `META_PAGE_ID`.** El `PAGE_ACCESS_TOKEN` actual del chatbot se conserva. Validar duración/renovación de tokens de Meta antes de operación diaria.

## TikTok — primero upload/draft

- [ ] `TIKTOK_CLIENT_KEY`
- [ ] `TIKTOK_CLIENT_SECRET`
- [ ] `TIKTOK_REDIRECT_URI` — URL HTTPS exacta `${APP_BASE_URL}/social/oauth/tiktok/callback` registrada en la app.
- [ ] App Developer y productos Login Kit / Content Posting API autorizados para la cuenta.
- [ ] Scopes `user.info.basic`, `video.upload`, `video.list`.
- [ ] `TIKTOK_VERIFIED_MEDIA_URL_PREFIX` — solo si se usa PULL_FROM_URL; verificar dominio/prefijo desde TikTok.

Access token, refresh token y `open_id` los produce OAuth y se almacenan en la bóveda/cuenta. No añadir variables ficticias `TIKTOK_ACCESS_TOKEN`, `TIKTOK_REFRESH_TOKEN` o `TIKTOK_OPEN_ID`. `video.publish`/Direct Post se posponen hasta auditoría y autorización explícita. Un borrador necesita finalizarse dentro de TikTok.

## Backend / cifrado / n8n Community local / worker

- [ ] `ADMIN_API_TOKEN`
- [ ] `N8N_WEBHOOK_SECRET` — secreto dedicado diferente del administrativo y worker, mínimo 32 caracteres en producción.
- [ ] `LOCAL_WORKER_API_TOKEN` — exclusivo del PC y backend.
- [ ] `SOCIAL_TOKEN_ENCRYPTION_KEY` — exactamente 32 bytes aleatorios en base64; guardar copia segura y no rotarla sin migrar la bóveda.
- [ ] `SOCIAL_OAUTH_ENABLED=true` solo después de configurar la app y callbacks; independiente de publicar.
- [ ] `PIXELLABS_API_URL` y `PIXELLABS_N8N_API_TOKEN` en `n8n/local/config.env`; este token es el mismo `N8N_WEBHOOK_SECRET` del backend.
- [ ] `N8N_ENCRYPTION_KEY` — generada por el instalador local, distinta de la clave de tokens sociales.
- [ ] `LOCAL_WORKER_API_URL`, `LOCAL_WORKER_ID`, carpetas locales y FFmpeg/ffprobe desde la configuración existente.

Conservar `AUTO_PUBLICATION=false`, `CONTENT_ENGINE_AUTO_PUBLISH=false`, `SOCIAL_PUBLISH_MODE=draft`, `SOCIAL_EXTERNAL_REQUESTS_ENABLED=false`. Todos los workflows siguen inactivos hasta verificar la conexión en el PC. No contratar n8n Cloud ni cambiar Render Free.

## Datos necesarios

- [ ] Fotos propias y clips reales de los productos existentes; confirmar propiedad, privacidad y referencia de catálogo.
- [ ] Verificar catálogo real y disponibilidad antes de generar promociones.
- [ ] Elegir días, horarios, cantidades y formatos desde el panel.
- [ ] Fuentes de tendencias propias, oficiales o RSS autorizadas.
- [ ] Autorización explícita de QA por cuenta antes de cualquier publicación pública real. Actualmente no se ha solicitado ni realizado.
