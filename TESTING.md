# Pruebas

Ejecutar:

```bash
npm test
npm run check
```

La suite actual cubre:

- Valores iniciales seguros.
- Cantidades diarias editables.
- Umbrales incoherentes.
- Auto-publicación prohibida en modo manual.
- Interruptor global.
- Content-Range y bloques duplicados.
- Reanudación y bloques fuera de orden.
- Subida incompleta, excesiva o dañada.
- Token administrativo.
- Idempotencia de trabajos n8n.
- Separación de ejecución entre runner web y agente local.
- Arrendamiento, heartbeat, reintento y token exclusivo del agente local.
- Rechazo de traversal/symlinks y procesamiento FFmpeg real desde la bandeja.
- Producto agotado, tendencia nueva y barrera final de publicación.

Se realizó además una prueba HTTP real: raíz 200, API sin token 401, API con token 200 y actualización 200.

La suite ampliada incluye:

- Catálogo real, producto agotado y cooldown.
- CRM, atribución y firma criptográfica de Meta.
- Borrador, ocho revisiones, duplicados, aprobación humana y auditoría.
- Exportación social como borrador, sin solicitud externa.
- Bloqueo previo a red de todos los clientes sociales sin aprobación explícita.
- Cifrado autenticado de tokens OAuth.
- Worker persistente, recuperación e interruptor de publicación.
- Generación de un MP4 real, análisis con `ffmpeg`, render vertical y portada.
- Prueba HTTP completa de catálogo → revisión → aprobación → exportación.
- Validación de 12 flujos n8n inactivos y sin credenciales.
- Radar: fuente autorizada, deduplicación y rechazo por riesgo legal.
- Plan editorial: nueve espacios configurables, categorías variadas, día de descanso y minutos únicos.
- Corrección de texto de bajo riesgo y derivación humana de privacidad.
- Métricas: ventas/mensajes por encima de visualizaciones aisladas.
- HTTP real de radar, calendario y resumen de métricas.
- Supabase real: cinco migraciones, RLS, relaciones, índices, bucket privado y prueba transaccional con rollback.
- Perfil Render Free: sin disco ni plan pagado, Supabase obligatorio, API
  disponible, FFmpeg bloqueado y biblioteca sincronizada accesible.
- Readiness de base de datos, producto requerido y bucket privado.
- API n8n de mínimo privilegio sin token administrativo.
- Política de runtime que impide ejecutar FFmpeg sobre almacenamiento efímero en
  producción.
- Reconstrucción del contexto conversacional persistido en CRM.

Pendientes al conectar servicios: archivos reales de 10 minutos y una hora,
transcripción semántica, OAuth sandbox, errores/reintentos reales de Meta/TikTok
y métricas obtenidas desde cuentas reales.

Última validación local completa: **73/73 pruebas aprobadas**, 12 flujos n8n
inactivos y 0 vulnerabilidades reportadas por `npm audit --omit=dev`.
