# Arquitectura

## Sistema actual conservado

El chatbot sigue entrando por `/webhook`, normaliza Messenger/Instagram/WhatsApp, genera respuesta con Gemini y guarda el estado actual en `src/memory/conversations.json`. Esta persistencia es temporal y deberá migrarse al CRM de Supabase.

## Content Engine

```text
Panel / n8n
    -> API administrativa protegida
        -> configuración y barreras de publicación
        -> repositorios Supabase
        -> subida reanudable
            -> ffprobe + checksum
            -> proxy ffmpeg
            -> segmentos de 5 minutos
        -> trabajos idempotentes de n8n
```

Los módulos están en `src/contentEngine/`:

- `config`: valores iniciales y validación estricta.
- `db`: cliente Supabase exclusivo del backend.
- `repositories`: persistencia de configuración y videos.
- `review`: decisión final y guardia de publicación.
- `services`: configuración y cola de flujos.
- `video`: rangos, subida, validación y procesamiento asíncrono.
- `social`: capacidades oficiales, variantes por plataforma, cifrado de tokens y clientes API sin conexión automática.
- `repositories`: adaptadores equivalentes para archivos locales y Supabase.

## Flujo ejecutable

```text
Chatbot / Panel / n8n
        -> API administrativa protegida
        -> catálogo + CRM + biblioteca
        -> cola persistente
        -> video: proxy -> segmentos -> señales -> clips -> render
        -> 8 revisiones -> aprobación humana
        -> paquete por plataforma (sin publicación externa)
```

El backend ejecuta trabajos idempotentes y recupera estados `QUEUED`/`RUNNING` al reiniciar. El flujo de publicación comprueba primero el interruptor global, `autoPublish` y `approvalMode`; en la etapa actual siempre termina bloqueado sin llamadas externas.

## Decisiones

- CommonJS y Express se conservan para no reescribir el chatbot.
- Supabase es la fuente duradera; el archivo local solo sirve en desarrollo.
- n8n orquesta, pero no posee reglas comerciales ni secretos del frontend.
- La publicación automática nace apagada.
- Cada publicación debe tener idempotencia, confirmación externa y trazabilidad.
