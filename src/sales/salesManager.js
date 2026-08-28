const campos = [
    "producto",
    "archivo",
    "imagen",
    "color",
    "cantidad",
    "tamaño"
];

function normalizar(valor) {
    return String(valor || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
}

function obtenerEstadoConversacion(conversation) {
    const estado = {
        producto: false,
        archivo: false,
        imagen: false,
        color: false,
        cantidad: false,
        tamaño: false
    };

    const mensajesUsuario = conversation
        .filter(m => m.role === "user")
        .map(m => normalizar(m.message));

    const texto = mensajesUsuario.join("\n");
    const contiene = frase => mensajesUsuario.some(mensaje => mensaje.includes(normalizar(frase)));

    // ======================================
    // PRODUCTO
    // ======================================

    const productos = [
        "llavero", "figura", "maceta", "organizador", "soporte",
        "porta celular", "portacelular", "logo", "letras", "letrero",
        "busto", "casco", "espada", "katana", "auto", "carro",
        "automovil", "camion", "moto", "avion", "barco", "juguete",
        "prototipo", "pieza", "repuesto", "tapa", "base", "placa",
        "engranaje", "decoracion", "caja", "rompecabezas", "rompecabeza",
        "modelo", "miniatura", "trofeo", "fidget", "dragon",
        "dinosaurio", "capibara", "orca", "gato", "estrella", "cubo",
        "portalapices", "joyero", "ballena", "mariposa", "nombre",
        "rotulo", "medalla", "premio", "estuche", "contenedor",
        "adaptador", "gancho", "perchero", "adorno"
    ];

    estado.producto = productos.some(producto => texto.includes(producto));

    if (!estado.producto) {
        const palabrasNoProducto = [
            "cotizacion", "informacion", "imagen", "foto", "ayuda", "idea",
            "precio", "presupuesto", "consulta", "pregunta", "favor", "algo",
            "nombre", "color", "cantidad", "medida", "tamano", "stl", "archivo"
        ];

        estado.producto = mensajesUsuario.some(mensaje => {
            const coincidencia = mensaje.match(
                /\b(?:quiero|quisiera|necesito|deseo|busco|ocupo|cotizar|hacer|imprimir|crear|me gustaria)\s+(?:(?:que\s+(?:me|nos)\s+)?(?:cotizar|hacer|imprimir|crear)\s+)?(?:(?:un|una|unos|unas|el|la|los|las)\s+)?([a-zñ][a-zñ0-9_-]{1,}(?:\s+[a-zñ][a-zñ0-9_-]{1,}){0,4})/i
            );

            if (!coincidencia) return false;

            const candidato = coincidencia[1].trim();
            const primeraPalabra = candidato.split(/\s+/)[0];

            return !palabrasNoProducto.includes(primeraPalabra);
        });
    }

    if (!estado.producto) {
        for (let i = 1; i < conversation.length; i++) {
            const actual = conversation[i];
            const anterior = conversation[i - 1];

            if (actual?.role !== "user" || anterior?.role !== "assistant") continue;

            const pregunta = normalizar(anterior.message);
            const respuesta = normalizar(actual.message);

            const preguntaProducto =
                pregunta.includes("que producto") ||
                pregunta.includes("que deseas imprimir") ||
                pregunta.includes("que quieres imprimir") ||
                pregunta.includes("que necesitas imprimir") ||
                pregunta.includes("que pieza") ||
                pregunta.includes("que deseas cotizar") ||
                pregunta.includes("que quieres cotizar") ||
                pregunta.includes("que necesitas cotizar");

            const respuestaValida =
                /[a-zñ]/i.test(respuesta) &&
                respuesta.length >= 2 &&
                respuesta.length <= 100 &&
                !/^(hola|buenas|gracias|si|no|ok|vale|lucas|a nombre de)/i.test(respuesta);

            if (preguntaProducto && respuestaValida) {
                estado.producto = true;
                break;
            }
        }
    }

    // ======================================
    // STL / ARCHIVO
    // ======================================

    const noTieneSTL =
        contiene("no tengo stl") ||
        contiene("no tengo archivo stl") ||
        contiene("no cuento con stl") ||
        contiene("no cuento con archivo stl") ||
        contiene("sin stl") ||
        contiene("sin archivo stl") ||
        contiene("solo tengo una imagen") ||
        contiene("unicamente tengo una imagen") ||
        contiene("solo cuento con una imagen");

    const tieneSTL =
        !noTieneSTL && (
            contiene("tengo stl") ||
            contiene("cuento con stl") ||
            contiene("tengo archivo stl") ||
            contiene("cuento con archivo stl") ||
            contiene("adjunto el stl") ||
            contiene("adjunto stl") ||
            contiene("te envio el stl") ||
            contiene("aqui esta el stl")
        );

    estado.archivo = tieneSTL || noTieneSTL;

    // ======================================
    // IMAGEN
    // Con STL no se exige imagen. Sin STL sí se necesita referencia visual.
    // ======================================

    const noTieneImagen =
        contiene("no tengo imagen") ||
        contiene("no tengo foto") ||
        contiene("sin imagen") ||
        contiene("sin foto") ||
        contiene("no cuento con imagen") ||
        contiene("no cuento con foto");

    const tieneImagen =
        !noTieneImagen && (
            contiene("[imagen]") ||
            contiene("imagen") ||
            contiene("foto") ||
            contiene("fotografia")
        );

    estado.imagen = tieneSTL ? true : tieneImagen;

    // ======================================
    // COLOR
    // ======================================

    const colores = [
        "negro", "negra", "blanco", "blanca", "gris", "grises",
        "gris oscuro", "gris oscura", "gris claro", "gris clara",
        "rosa", "rosado", "rosada", "verde", "verdes", "verde bambu",
        "verde brillante", "cafe", "marron"
    ];

    estado.color = colores.some(color => texto.includes(color));

    // ======================================
    // CANTIDAD
    // ======================================

    const numeroPalabra = "(?:uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|veinte)";

    estado.cantidad = mensajesUsuario.some(mensaje => {
        const limpio = mensaje
            .replace(/[.!?,;:]+$/g, "")
            .trim();

        if (/\b\d+\s*(?:unidad(?:es)?|pieza(?:s)?|llavero(?:s)?|figura(?:s)?|producto(?:s)?|caja(?:s)?|impresion(?:es)?|ejemplar(?:es)?|articulo(?:s)?)\b/i.test(limpio)) {
            return true;
        }

        if (/\b(?:cantidad(?:\s+de)?|solo\s+necesito|solamente\s+necesito|necesito|quiero|quisiera|ocupo|seria|serian|seran|son|solo|solamente)\s*(?:de\s*)?\d+\b(?!\s*(?:mm|cm|m|milimetros?|centimetros?|metros?))/i.test(limpio)) {
            return true;
        }

        if (/\b(?:solo\s+quiero|quiero\s+solo|nada\s+mas|nomas|unicamente)\s+\d+\b(?!\s*(?:mm|cm|m))/i.test(limpio)) {
            return true;
        }

        if (/\b\d+\s*(?:nada\s+mas|nomas|solamente|solo)\b/i.test(limpio)) {
            return true;
        }

        if (/^(?:cantidad\s*:?[ ]*)?\d{1,3}$/.test(limpio)) {
            return true;
        }

        if (new RegExp(`^(?:solo\\s+|solamente\\s+|unicamente\\s+)?${numeroPalabra}(?:\\s+solo|\\s+nada\\s+mas|\\s+nomas)?$`, "i").test(limpio)) {
            return true;
        }

        if (new RegExp(
            `\\b(?:cantidad(?:\\s+de)?|solo\\s+necesito|solamente\\s+necesito|necesito|quiero|solo\\s+quiero|quiero\\s+solo|quisiera|ocupo|seria|serian|seran|son|solo|solamente|unicamente|nada\\s+mas)\\s*(?:de\\s*)?${numeroPalabra}\\b`,
            "i"
        ).test(limpio)) {
            return true;
        }

        if (/\b(?:un|una)\s+(?:unidad|pieza|llavero|figura|maceta|organizador|soporte|carro|auto|modelo|caja|logo|letrero|trofeo|repuesto|casco|moto|juguete|prototipo|producto)\b/i.test(limpio)) {
            return true;
        }

        return false;
    });

    if (!estado.cantidad) {
        for (let i = 1; i < conversation.length; i++) {
            const actual = conversation[i];
            const anterior = conversation[i - 1];

            if (actual?.role !== "user" || anterior?.role !== "assistant") continue;

            const pregunta = normalizar(anterior.message);
            const respuesta = normalizar(actual.message);

            const preguntaCantidad =
                pregunta.includes("cuantas unidades") ||
                pregunta.includes("cuantos necesitas") ||
                pregunta.includes("cuantas necesitas") ||
                pregunta.includes("que cantidad") ||
                pregunta.includes("cantidad necesitas") ||
                pregunta.includes("cantidad deseas");

            const respuestaCantidad =
                /\b\d{1,3}\b/.test(respuesta) ||
                new RegExp(`\\b${numeroPalabra}\\b`, "i").test(respuesta);

            const pareceMedida = /\b\d+(?:[.,]\d+)?\s*(?:mm|cm|m|milimetros?|centimetros?|metros?)\b/i.test(respuesta);

            if (preguntaCantidad && respuestaCantidad && !pareceMedida) {
                estado.cantidad = true;
                break;
            }
        }
    }

    // ======================================
    // TAMAÑO / MEDIDAS
    // ======================================

    estado.tamaño = mensajesUsuario.some(mensaje => {
        const medidaConUnidad = /\b\d+(?:[.,]\d+)?\s*(?:mm|cm|m|milimetros?|centimetros?|metros?)\b/i.test(mensaje);
        const medidaMultiplicada = /\b\d+(?:[.,]\d+)?\s*[x×]\s*\d+(?:[.,]\d+)?(?:\s*[x×]\s*\d+(?:[.,]\d+)?)?\b/i.test(mensaje);
        return medidaConUnidad || medidaMultiplicada;
    });

    return estado;
}

function obtenerCamposFaltantes(estado) {
    return campos.filter(campo => !estado[campo]);
}

module.exports = {
    obtenerEstadoConversacion,
    obtenerCamposFaltantes
};
