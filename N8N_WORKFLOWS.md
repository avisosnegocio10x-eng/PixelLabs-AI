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

Cada flujo conserva el payload de entrada, encola un trabajo mediante API con `Idempotency-Key`, espera cinco segundos sin ocupar el proceso y consulta el estado del worker. El worker persistente consume la cola, guarda el resultado y recupera trabajos interrumpidos al reiniciar. Los flujos no deben activarse hasta configurar la instancia real y probar cada uno manualmente. El flujo 9 debe permanecer apagado hasta concluir OAuth y recibir autorización explícita; aun si se ejecuta por accidente, devuelve `AUTO_PUBLISH_DISABLED` y cero solicitudes externas.

Validar exportaciones:

```bash
npm run build:n8n
npm run validate:n8n
```

Importación más sencilla: en n8n abre **Workflows → Import from File** e importa los 12 JSON de `n8n/workflows/`. Verifica que todos aparezcan como **Inactive**. Para una instancia autohospedada también se admite el comando oficial `n8n import:workflow --separate --input=/ruta/n8n/workflows`; vuelve a validar el estado desde la interfaz antes de configurar credenciales.
