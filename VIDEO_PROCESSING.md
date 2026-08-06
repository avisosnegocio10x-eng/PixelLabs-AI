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

## Análisis y clips

Después de segmentar, el worker ejecuta por segmento:

- detección de cambios de escena;
- detección de silencios;
- detección de cuadros negros;
- eliminación de candidatos demasiado solapados;
- propuesta de ventanas de clip sin imponer una cantidad fija.

Los candidatos quedan con privacidad `PENDING_HUMAN_REVIEW` y `automaticPublishEligible: false`. La detección semántica de acciones de impresión 3D y la transcripción quedan en `PENDING_PROVIDER` hasta conectar un proveedor autorizado.

## Render

El panel crea MP4 vertical H.264/AAC y portada JPEG. El fondo se adapta con desenfoque y el video se conserva centrado. No añade transiciones aleatorias, texto inventado, música ni logo no verificado. Para aprobar se exige una versión renderizada, puntaje mínimo 85 y confirmación humana de privacidad.
