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
- Producto agotado, tendencia nueva y barrera final de publicación.

Se realizó además una prueba HTTP real: raíz 200, API sin token 401, API con token 200 y actualización 200.

La suite ampliada incluye:

- Catálogo real, producto agotado y cooldown.
- CRM, atribución y firma criptográfica de Meta.
- Borrador, ocho revisiones, duplicados, aprobación humana y auditoría.
- Exportación social como borrador, sin solicitud externa.
- Cifrado autenticado de tokens OAuth.
- Worker persistente, recuperación e interruptor de publicación.
- Generación de un MP4 real, análisis con `ffmpeg`, render vertical y portada.
- Prueba HTTP completa de catálogo → revisión → aprobación → exportación.
- Validación de 12 flujos n8n inactivos y sin credenciales.

Pendientes al conectar servicios: migración contra Supabase, archivos reales de 10 minutos y una hora, OAuth sandbox, errores/reintentos reales de Meta/TikTok y métricas reales.
