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
- Plan editorial: tres espacios iniciales configurables, límites por formato, categorías, días activos y minutos únicos.
- Corrección de texto de bajo riesgo y derivación humana de privacidad.
- Métricas: ventas/mensajes por encima de visualizaciones aisladas.
- HTTP real de radar, calendario y resumen de métricas.
- Registro histórico: Supabase real validado en agosto; la nueva migración no se aplicó al proyecto real en esta sesión.
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

Validación 2026-10-06: **102/102 tests**, frente a **86/86** antes de modificar. Incluye tendencia → idea → copies distintos → fallo de revisión → corrección → nueva revisión → aprobación humana → calendario → publicación simulada concurrente → métricas. Cero QA público y cero llamadas reales a Gemini/Meta/TikTok.

También: seis migraciones ejecutadas con PGlite y nueva migración aplicada dos veces; OAuth firmado/cifrado; cuotas persistentes; límites; invalidación por edición/stock/privacidad; uploads/previews HTTP. Simulaciones excluidas del aprendizaje y snapshots acumulados sin doble conteo.

Panel comprobado con DOM (jsdom) y HTTP local: login, preview, aprobar, programar, editar invalidando aprobación, días activos y OAuth apagado. No es QA visual en navegador: su descarga no estuvo disponible en este entorno.

Prueba reproducible con CLI n8n Community 2.33.7 instalado:

```bash
npm run test:n8n:runtime
# Si no está en PATH:
N8N_QA_BINARY=/ruta/al/binario/n8n npm run test:n8n:runtime
```

El script usa instancia/backend temporales propios, sin credenciales de producción ni activación. Resultado: 12 workflows, 0 activos, 10 trabajos completados, 2 videos en cola local y 0 solicitudes IA/sociales. La conexión en el PC del usuario sigue pendiente.
