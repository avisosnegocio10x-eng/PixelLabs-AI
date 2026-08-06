# Despliegue

## Backend en Render

- `Dockerfile` instala Node 22, `ffmpeg`, `ffprobe` y `dumb-init`.
- `render.yaml` fija la rama `agent/pixellabs-content-engine` y desactiva Auto Deploy.
- Health inicial: `GET /`
- Disco persistente de 10 GB montado en `/app/storage`.
- `ADMIN_API_TOKEN`, `N8N_WEBHOOK_SECRET` y `SOCIAL_TOKEN_ENCRYPTION_KEY` se generan en Render.
- Supabase se solicita con `sync: false`; los valores no se guardan en Git.

Para videos de varias horas es preferible usar almacenamiento de objetos y un worker separado cuando crezca la carga. La configuración inicial usa un único servicio y limita video a un trabajo concurrente, que es la opción de menor costo y menor complejidad.

## Costo mínimo viable

Render solo permite disco persistente en servicios pagados. El filesystem del plan gratuito es efímero y perdería subidas al reiniciar, por lo que no debe usarse para la biblioteca real. La documentación oficial de Render indica un costo de disco de **$0.25 por GB al mes**; 10 GB equivalen a $2.50/mes más el cómputo `starter`. No se crea ni cobra ningún recurso al guardar este Blueprint.

## Supabase

1. Crear proyecto.
2. Aplicar `001_content_engine.sql` y `002_crm_and_jobs.sql`.
3. Confirmar el bucket privado `pixellabs-content`.
4. Configurar `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` solo en Render.
5. Ejecutar `npm run verify:supabase` dentro del entorno seguro.

## Activación segura

1. Desplegar con automatización apagada.
2. Probar subida y panel.
3. Importar n8n sin activar.
4. Conectar una plataforma mediante OAuth.
5. Probar borradores.
6. Mantener aprobación manual durante la etapa inicial.
