# Agente local de video

Este agente mantiene los videos originales, proxies y segmentos en la PC de
PixelLabs. Render solo coordina la cola; Supabase conserva metadatos y los clips
finales que no superen el límite configurado.

## Preparación en Windows

1. Instalar Node.js 22 LTS y FFmpeg/ffprobe.
2. Copiar `config.example.env` como `.env` dentro de esta carpeta.
3. Colocar en `.env` el token `LOCAL_WORKER_API_TOKEN` obtenido directamente
   desde Render. Nunca pegarlo en chats, commits o capturas.
4. Copiar videos a `local-worker/inbox`.
5. Ejecutar `INICIAR-WORKER.bat`.

El agente valida que la API use HTTPS, rechaza rutas fuera de la bandeja,
calcula SHA-256, crea proxy, divide en segmentos de cinco minutos, analiza
señales, renderiza clips verticales y sube únicamente resultados finales por
URLs firmadas de dos horas. No recibe la clave `service_role` de Supabase.

Todos los clips quedan en borrador con privacidad pendiente. El agente no puede
aprobar ni publicar contenido.
