# Despliegue

## Backend en Render

- Build: `npm ci`
- Start: `npm start`
- Health inicial: `GET /`
- Disco persistente recomendado para `CONTENT_ENGINE_UPLOAD_DIR` y `CONTENT_ENGINE_WORK_DIR`.
- Instalar una imagen/servicio que incluya `ffmpeg` y `ffprobe`.

Para videos de varias horas es preferible usar almacenamiento de objetos y un worker separado del servidor web. El código actual sirve como worker único inicial y limita concurrencia a uno.

## Supabase

1. Crear proyecto.
2. Aplicar `database/migrations/001_content_engine.sql`.
3. Crear bucket privado `pixellabs-content`.
4. Configurar `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` solo en Render/n8n.

## Activación segura

1. Desplegar con automatización apagada.
2. Probar subida y panel.
3. Importar n8n sin activar.
4. Conectar una plataforma mediante OAuth.
5. Probar borradores.
6. Mantener aprobación manual durante la etapa inicial.
