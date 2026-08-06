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

Pendientes al conectar servicios: migración contra Supabase de staging, archivo real de 10 minutos, archivo real de una hora, OAuth sandbox, errores/reintentos de Meta/TikTok y métricas reales.
