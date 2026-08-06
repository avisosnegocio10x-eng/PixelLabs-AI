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
- Disco inicial de 10 GB ampliable; no puede reducirse en Render.

No borrar originales sin aprobación. Los temporales y proxies pueden someterse a política de retención una vez verificados los clips finales.
