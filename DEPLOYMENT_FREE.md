# Despliegue gratuito seguro

Evaluación verificada el 10 de agosto de 2026.

## Qué sí funciona en Render Free

`render.free.yaml` crea un Web Service separado llamado
`pixellabs-content-engine-free` y no modifica `render.yaml` ni el servicio de
producción. Mantiene Auto Deploy apagado y no declara discos ni instancias de
pago.

Usa `Dockerfile.free`, una imagen separada que no instala FFmpeg ni ffprobe. Así
el perfil gratuito no solo desactiva las rutas: tampoco incluye el ejecutor
pesado en su contenedor.

En este perfil funcionan:

- backend y webhooks;
- panel administrativo;
- chatbot y recuperación de su contexto desde CRM;
- catálogo, CRM, tendencias, calendario, contenido, revisiones y métricas;
- colas y estados persistidos en PostgreSQL de Supabase;
- aprobación humana y exportaciones sociales en modo borrador;
- pruebas HTTP del servicio desplegado.

`REQUIRE_SUPABASE=true` evita que producción caiga silenciosamente a archivos
JSON efímeros. Si faltan `SUPABASE_URL` o `SUPABASE_SERVICE_ROLE_KEY`, el proceso
se niega a arrancar.

Render consulta `/healthz`. El endpoint devuelve 503 si Supabase está configurado
pero no responde, sin revelar claves ni mensajes internos del proveedor.

## Qué no se ejecuta en el perfil gratuito

`CONTENT_ENGINE_VIDEO_MODE=disabled` bloquea con HTTP 503 la subida, validación,
segmentación y render de video. Las consultas de biblioteca siguen respondiendo
para que el resto del panel funcione. La decisión es deliberada:

- Render Free tiene 512 MB de RAM, 0.1 CPU y se duerme tras 15 minutos sin
  solicitudes entrantes;
- su filesystem es efímero y se borra al dormir, reiniciar o desplegar;
- no admite discos persistentes ni background workers gratuitos;
- Supabase está actualmente en plan Free: 1 GB de almacenamiento de archivos,
  50 MB máximo por archivo, 5 GB de egress no cacheado y 5 GB cacheado.

Supabase conserva todos los datos estructurados. Los directorios `/tmp` de
Render quedan reservados para temporales pequeños y nunca son la fuente de
verdad.

Render concede 750 horas Free por workspace cada mes. El servicio se suspende si
agota ese cupo. El ancho de banda y los minutos de build también tienen cuotas;
con método de pago podrían generar excedentes, por lo que debe mantenerse un
límite de gasto de $0 durante esta etapa.

## Videos de 1 a 10 horas

El tamaño depende del bitrate. Como referencia, a 8 Mb/s una hora ocupa unos
3.6 GB y diez horas unos 36 GB antes de crear proxy, segmentos y renders. Durante
el procesamiento puede necesitarse entre 1.3 y 2 veces el tamaño del original.

### Opción recomendada ahora: procesador local

- Costo cloud adicional: **$0/mes**.
- Ejecutar el backend local con `CONTENT_ENGINE_VIDEO_MODE=local` en la PC de
  PixelLabs.
- Conservar los originales y temporales en esa PC.
- Sincronizar metadatos en Supabase y subir únicamente clips finales comprimidos
  que respeten 50 MB por archivo y el total de 1 GB.
- Limitación: la PC debe permanecer encendida durante el procesamiento; la cola
  de video no es un worker cloud siempre disponible.

Esta es la recomendación para la etapa actual porque el volumen real todavía no
justifica pagar infraestructura permanente para trabajos ocasionales.

### Opción cloud mínima con el Blueprint actual

- Render Web Service Starter: aproximadamente **$7/mes**.
- Disco de 10 GB: **$2.50/mes** a $0.25/GB.
- Total: aproximadamente **$9.50/mes**.

Sirve para pruebas controladas y videos pequeños, pero no es suficiente para
garantizar trabajos de hasta diez horas. Además mezcla API y FFmpeg en una sola
instancia.

### Opción cloud separada

- API en Render Free: **$0/mes**.
- Background Worker Starter: aproximadamente **$7/mes**, 512 MB y 0.5 CPU.
- Supabase Pro para archivos grandes: desde **$25/mes**, con 100 GB de archivos
  incluidos y límite configurable de hasta 500 GB por archivo.
- Total mínimo aproximado: **$32/mes**.

El worker Starter puede ser lento para diez horas. Un worker Standard aporta
2 GB y 1 CPU por aproximadamente **$25/mes**; junto con Supabase Pro, el total
sería aproximadamente **$50/mes**. Esta arquitectura exige completar primero el
adaptador de almacenamiento de objetos y el ejecutor de video independiente.

Otra posibilidad es un worker con disco Render de 100 GB: $7 de cómputo más $25
de disco, aproximadamente **$32/mes**. No se recomienda como diseño final porque
el disco solo puede conectarse a una instancia, impide escalar y elimina los
despliegues sin interrupción.

## Fuentes oficiales

- Render Free: https://render.com/docs/free
- Tipos de cómputo: https://render.com/docs/compute-plans
- Precios: https://render.com/pricing
- Discos y limitaciones: https://render.com/docs/disks
- Supabase Storage: https://supabase.com/pricing
- Límites de archivo: https://supabase.com/docs/guides/storage/uploads/file-limits
- Subidas reanudables: https://supabase.com/docs/guides/storage/uploads/resumable-uploads

Los precios pueden cambiar. Deben volver a verificarse antes de activar cualquier
recurso pagado.
