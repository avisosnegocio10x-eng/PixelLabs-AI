# PixelLabs en Windows

Descarga/clona la rama `agent/pixellabs-content-engine`, extrae el ZIP completo y haz doble clic en **INSTALAR-PIXELLABS.bat** desde esa carpeta. Conserva la carpeta completa: descargar solo el BAT no instala el proyecto.

1. Autoriza únicamente las dependencias gratuitas que falten. Se usa winget con IDs exactos: `Git.Git`, `OpenJS.NodeJS.22`, `Docker.DockerDesktop`, `Gyan.FFmpeg`.
2. Si Windows solicita UAC para WSL2, el proceso elevado solo prepara WSL2. Los demás componentes se ejecutan como tu usuario. No se cambia la política de ejecución de Windows; el BAT permite los scripts del repositorio únicamente en su proceso PowerShell.
3. Si aparece **REBOOT REQUIRED**, reinicia Windows y abre el mismo instalador. No se borran datos ni se rotan claves.
4. Abre Docker Desktop cuando se solicite y espera a **Engine running**, con contenedores Linux. No contrates suscripciones ni actives billing.
5. Espera **INSTALACION LOCAL TERMINADA**. Cualquier error devuelve un código distinto de cero y conserva configuración, videos y volumen.
6. Abre **INICIAR-PIXELLABS.bat**. Crea el propietario local de n8n en `http://127.0.0.1:5678`; mantén los doce workflows **Inactive**.

El panel aparece en `http://127.0.0.1:3000/admin` por defecto. Su token administrativo está en el archivo privado `setup/windows/local.env`; cópialo solo al login local del panel. Nunca se incluye en URLs o logs.

| Archivo | Uso |
|---|---|
| `INSTALAR-PIXELLABS.bat` | Dependencias, configuración, n8n, worker y todas las pruebas |
| `INICIAR-PIXELLABS.bat` | Backend/n8n locales y worker offline, con estado OK/FAIL |
| `DETENER-PIXELLABS.bat` | Parada conservando videos, configuración y volumen n8n |
| `REPARAR-PIXELLABS.bat` | Revisa dependencias, permisos/configuración, importa solo faltantes y repite las pruebas |
| `CONFIGURAR-CREDENCIALES.bat` | Introduce claves directamente en este PC con entrada oculta |

## Requisitos y reinicio

Windows cliente x64: Windows 11 build 22631 o posterior, o Windows 10 22H2 build 19045 con soporte ESU vigente. No Windows Server ni ARM. PowerShell 5.1+, al menos 8 GB RAM, virtualización/SLAT, Node.js **22 LTS >=22.22.0**, npm, Docker Desktop con Compose v2 y FFmpeg/ffprobe. n8n `2.33.7` exige Node >=22.22; `OpenJS.NodeJS.LTS` puede instalar otra rama y por eso no se usa.

La comprobación inicial muestra `OK`, `MISSING`, `NEEDS_UPDATE`, `NEEDS_RESTART` y `ACTION REQUIRED`. Una versión Node diferente, WSL no preparado, virtualización desactivada o un motor Docker remoto impiden continuar silenciosamente. Un Node incompatible puede necesitar resolver su instalación existente desde Windows; el script no desinstala versiones de otros proyectos automáticamente.

Sin winget, instala **App Installer de Microsoft** desde `https://aka.ms/getwinget` y repite. No se usan scripts remotos, ejecutables de proveedores desconocidos, cambios de antivirus, reglas de firewall ni exposición pública. WSL usa `wsl --install --no-distribution` o `wsl --update`; la virtualización en BIOS/UEFI exige intervención humana.

## Perfil local y scripts existentes

Se conserva el backend/chatbot, las rutas Messenger/webhook/Gemini/email, su modelo y los scripts anteriores de `n8n/local/` y `local-worker/`. El instalador crea un **perfil separado**:

- `setup/windows/local.env`: configuración del backend y cinco secretos diferentes.
- `setup/windows/worker.env`: worker offline con token dedicado y carpetas locales.
- `setup/windows/n8n.env`: clave n8n y copia únicamente del secreto de automatización del backend.
- `n8n/local/config.env`: se prepara si falta; cualquier configuración existente se conserva. El Compose maestro selecciona explícitamente `n8n.env` sin cambiar el flujo legacy.
- `setup/windows/state/`: progreso, identificación de procesos y heartbeat sin tokens.
- `logs/`: instalación y salida sanitizada de servicios; sin transcripciones de entradas privadas.

Todos los archivos privados y sus temporales están ignorados por Git. Las ACL permiten acceso al usuario propietario, SYSTEM y Administradores. Los cinco secretos se generan con RNG criptográfico, 32 bytes cada uno, preservados al reinstalar. La clave social usa base64 canónico de exactamente 32 bytes. La clave n8n existente se reutiliza: si hay volumen persistente y se perdió la clave, el instalador exige restaurarla antes de continuar.

Los scripts legacy siguen disponibles para la conexión previa a Render. En una instalación nueva usa los BAT maestros; el `CONFIGURAR-N8N.bat` antiguo está orientado a Render y su validación HTTPS.

## Componentes locales

El Compose adicional reutiliza la imagen/volumen de n8n y añade un backend con la imagen oficial `node:22-bookworm-slim`. El backend y n8n se comunican por el bridge privado de Docker. Solo se publican `127.0.0.1:3000` y `127.0.0.1:5678`. El worker corre con Node/FFmpeg del PC. No se instala ningún backend nuevo ni se despliega a Render.

Antes de arrancar n8n, el CLI exporta y comprueba su base: workflows activos, duplicados o ajenos producen error. La reparación importa **solo nombres faltantes**, conserva IDs/ediciones existentes y vuelve a comprobar exactamente 12 inactivos. No usa únicamente el marcador histórico para asumir que están completos.

Durante la instalación el worker está en pausa y no consume videos existentes. **INICIAR** lo inicia en modo offline: reutiliza `LocalVideoProcessor` y la política de fuentes existentes, conserva originales y genera borradores/portadas en `local-worker/work`. El registro local permite reanudar y evita procesar nuevamente videos ya terminados. Nada se sube a Supabase ni a redes sociales. Su vínculo con la cola remota sigue disponible mediante el worker legacy para una fase posterior.

La parada verifica PID, fecha de creación, ruta e instancia antes de detener únicamente el worker propio y sus hijos FFmpeg. Docker usa `compose stop`, nunca `down -v`. No se detienen otros procesos Node ni Docker Desktop.

## Conexiones pendientes

El modo offline funciona sin proveedores. **ACTION REQUIRED** indica una conexión pendiente; no equivale a un componente local roto. Usa `CONFIGURAR-CREDENCIALES.bat` y luego **REPARAR**. También puedes editar el archivo privado local directamente. No pegues credenciales en chats.

| Proveedor | Datos reales necesarios | Dónde |
|---|---|---|
| Supabase existente Free | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Settings > API |
| PostgreSQL de ese proyecto | `SUPABASE_DB_URL`, con contraseña de base de datos codificada como URL | Connect; usa el pooler si tu PC no tiene IPv6 |
| Gemini sin billing | `GEMINI_API_KEY` | Google AI Studio > API keys |
| Meta | `META_APP_ID`, `META_APP_SECRET`, `FACEBOOK_PAGE_ID`, versión Graph API | Meta Developers y la Página propia |
| TikTok | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | TikTok Developers > Manage apps |

Las dos credenciales REST de Supabase permiten comprobar tablas/columnas/settings/bucket con el verificador existente. **No permiten verificar índices/RLS/historial ni ejecutar SQL**. Con `SUPABASE_DB_URL`, un cliente PostgreSQL oficial efímero en Docker comprueba el esquema y aplica solo pendientes bajo transacción y lock. La contraseña va en un archivo temporal privado; nunca en argumentos/logs. TLS verifica el certificado del servidor.

Un esquema legacy sin historial solo se reconoce si cumple el contrato completo de las cinco migraciones existentes. Un esquema parcial, una clave/hash cambiada o una migración parcialmente aplicada sin registro requieren revisión; no se reaplican a ciegas. El registro privado `pixellabs_setup.schema_migrations` documenta hashes, sin sustituir el historial Supabase existente. No se crea un proyecto, se habilita Pro/billing ni se publica Storage. Un fallo al validar la seguridad o la conexión impide declarar instalación completada.

Gemini se prueba con **GET de metadatos del modelo**, sin generar contenido. Eso no demuestra Free Tier: comprueba personalmente que el proyecto carece de billing. `CONTENT_ENGINE_AI_ENABLED=false` se conserva incluso si la conexión pasa. El modelo del chatbot no se cambia.

Meta/TikTok solo tienen rutas/configuración preparadas y callbacks locales documentados; registra los callbacks HTTPS oficiales cuando prepares OAuth posteriormente. El instalador no hace OAuth ni solicitudes sociales.

## Barreras obligatorias

`AUTO_PUBLICATION=false`, `CONTENT_ENGINE_AUTO_PUBLISH=false`, `SOCIAL_PUBLISH_MODE=draft`, `SOCIAL_EXTERNAL_REQUESTS_ENABLED=false`, `SOCIAL_OAUTH_ENABLED=false`, `CONTENT_ENGINE_AI_ENABLED=false`.

Se revisan el entorno heredado, los perfiles locales y los archivos legacy. Si alguna bandera está activada, se aborta antes de sustituirla silenciosamente. **DETENER** continúa disponible para apagar componentes ante una configuración insegura.

## Pruebas y límites

La instalación ejecuta pruebas PowerShell aisladas, toda la suite Node, validación de los JSON, un MP4 H.264 local con FFmpeg/ffprobe, salud/autenticación/rutas locales y los 12 workflows reales en un contenedor QA sin red externa. QA no monta el volumen operativo ni utiliza credenciales del usuario.

Para diagnóstico técnico, `verify.ps1 -RunTests` repite estas pruebas; `self-test.ps1` prueba funciones del instalador sin instalar dependencias ni consultar proveedores. `-NonInteractive -AcceptDependencyInstall` acepta únicamente dependencias; no evita UAC, licencias, credenciales o reinicios. `PIXELLABS_NO_PAUSE=1` evita el pause de los BAT en automatización.

La validación realizada en Linux con Node/FFmpeg, PowerShell 7 y n8n real **no sustituye** una instalación completa en Windows con PowerShell 5.1, winget, UAC, Docker Desktop, WSL2 y reinicio. Ese QA físico debe completarse en el PC. No se activó ningún servicio pagado ni se conectaron cuentas sociales.

Fuentes oficiales usadas para los requisitos: [Docker Windows](https://docs.docker.com/desktop/setup/install/windows-install/), [winget install](https://learn.microsoft.com/en-us/windows/package-manager/winget/install), [WSL](https://learn.microsoft.com/en-us/windows/wsl/install), [FFmpeg](https://ffmpeg.org/download.html), [migraciones Supabase](https://supabase.com/docs/guides/deployment/database-migrations), [Gemini Models](https://ai.google.dev/api/models).
