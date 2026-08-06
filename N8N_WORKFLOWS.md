# Flujos de n8n

Los 12 JSON importables están en `n8n/workflows/` y todos tienen `active: false`.

## Variables de n8n

- `PIXELLABS_API_URL`: URL pública del backend, sin barra final.
- `PIXELLABS_ADMIN_API_TOKEN`: mismo secreto seguro configurado en el backend.

## Flujos

1. Investigación diaria.
2. Plan editorial.
3. Generación de publicaciones.
4. Procesamiento de video.
5. Edición de clips.
6. Revisión múltiple.
7. Corrección.
8. Aprobación.
9. Programación/publicación.
10. Métricas.
11. Optimización semanal.
12. Recuperación de errores.

Cada flujo encola un trabajo mediante API con `Idempotency-Key`. Esto impide que un reintento cree dos publicaciones. Los flujos de producción no deben activarse hasta conectar Supabase y sus workers. El flujo 9 debe permanecer apagado hasta concluir OAuth y aprobación manual de las primeras plantillas.
