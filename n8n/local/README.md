# n8n Community local para PixelLabs

Esta variante cuesta **$0/mes** y ejecuta n8n Community `2.33.7` en el PC de
PixelLabs. La interfaz escucha exclusivamente en `127.0.0.1:5678`; no abre un
webhook público ni expone el equipo a Internet. Los flujos solo realizan
solicitudes HTTPS salientes al Content Engine de Render.

## Persistencia y secretos

- El volumen `pixellabs_n8n_data` conserva usuarios, workflows, credenciales y
  ejecuciones aunque el contenedor se reinicie.
- `N8N_ENCRYPTION_KEY` cifra las credenciales locales. Guárdala fuera del
  repositorio y no la cambies después de configurar n8n.
- `PIXELLABS_N8N_API_TOKEN` debe coincidir con `N8N_WEBHOOK_SECRET` de Render.
- n8n no recibe `SUPABASE_SERVICE_ROLE_KEY`. El backend es la única puerta a
  Supabase y aplica validación, idempotencia, RLS, auditoría y límites.
- El acceso de nodos a variables se habilita porque Community no incluye un
  almacén externo de secretos y los JSON no deben contener credenciales. No
  importes workflows de terceros en esta instancia.

## Configuracion guiada recomendada

1. Instala y abre Docker Desktop.
2. Haz doble clic en `CONFIGURAR-N8N.bat`.
3. Cuando lo pida, pega `N8N_WEBHOOK_SECRET` desde Render. El valor no se
   muestra, no se imprime y se guarda solo en `config.env`, ignorado por Git.
4. Espera el mensaje `N8N LOCAL LISTO`.

El instalador genera `N8N_ENCRYPTION_KEY`, descarga la version fijada, evita
importaciones duplicadas, confirma 12/12 workflows `Inactive` y prueba desde el
contenedor la ruta autenticada n8n -> Render -> Supabase. La prueba es de solo
lectura: no crea contenido, no encola videos y no llama a redes sociales.

Después abre `http://127.0.0.1:5678` y crea el propietario local. No actives
ningún workflow todavía.

## Inicio manual alternativo

1. Instala Docker Desktop.
2. Copia `config.example.env` como `config.env`.
3. Completa los dos secretos localmente.
4. Ejecuta `INICIAR-N8N.bat`.
5. Abre `http://127.0.0.1:5678` y crea el propietario local.
6. Ejecuta `IMPORTAR-WORKFLOWS.bat`.
7. Confirma que los 12 aparecen como **Inactive**.

`DETENER-N8N.bat` detiene n8n sin borrar el volumen. No uses `docker compose
down -v`, porque `-v` elimina los datos locales.
