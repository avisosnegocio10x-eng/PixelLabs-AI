# Procesamiento de video

## Subida

1. Crear sesión con nombre, MIME y tamaño total.
2. Enviar bloques con `Content-Range: bytes inicio-fin/total`.
3. Consultar la sesión para reanudar.
4. Completar cuando todos los bytes estén cubiertos.

El backend escribe cada fragmento directamente en disco, fusiona rangos y evita contar dos veces un bloque reenviado.

## Validación y procesamiento

- Extensiones permitidas: MP4, MOV, M4V, MKV y WebM.
- `ffprobe` confirma que exista una pista de video.
- SHA-256 evita duplicados futuros.
- `ffmpeg` crea un proxy H.264/AAC de análisis.
- El proxy se divide en segmentos de cinco minutos.
- El trabajo se ejecuta fuera del ciclo HTTP y admite `SIGSTOP`/`SIGCONT` para pausar y reanudar.

Los estados se guardan en el manifiesto y, con Supabase configurado, en `source_videos`. Al reiniciar, los trabajos `QUEUED` o `PROCESSING` se recuperan; los pausados permanecen pausados.

## Siguiente capa

Transcripción, detección de escenas/movimiento, privacidad y propuestas de clips utilizarán `video_segments`, `video_transcripts`, `detected_moments`, `video_clips` y `clip_versions`.
