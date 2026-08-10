# Control de costos

Registrar cada gasto en metadatos del trabajo y, al conectar proveedores, agregar eventos de costo por transcripción, modelo, imagen, almacenamiento y publicación.

Controles iniciales:

- Proxy antes del análisis de IA.
- Segmentos de cinco minutos.
- Concurrencia de video igual a uno.
- Fingerprints e idempotencia.
- Límite configurable de subida y retención.
- Máximo de tres correcciones automáticas.
- No generar contenido para rellenar cuotas.
- Un solo trabajo de video concurrente.
- Render inicial de una sola versión por clip; las variantes extra requieren una acción.
- No ejecutar transcripción ni análisis semántico hasta configurar proveedor y presupuesto.
- El perfil gratuito no incluye disco y bloquea video pesado.
- `REQUIRE_SUPABASE=true` impide usar JSON efímero en producción.
- El Blueprint pagado permanece separado y sin activar.

No borrar originales sin aprobación. Los temporales y proxies pueden someterse a política de retención una vez verificados los clips finales.

## Decisión actual

- API/panel/chatbot/CRM: Render Free + Supabase Free, costo inicial $0.
- Video de 1 a 10 horas: procesamiento local, costo cloud adicional $0.
- No activar Starter ni disco hasta medir tamaño, frecuencia y duración real.
- Si se necesita video cloud siempre disponible, revisar primero
  `DEPLOYMENT_FREE.md`; el mínimo razonable empieza cerca de $32/mes al separar
  worker y almacenamiento apto para archivos grandes.
