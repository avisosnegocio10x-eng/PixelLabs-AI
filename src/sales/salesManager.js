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

function quitarMedidas(texto) {
    return normalizar(texto)
        .replace(/\b\d+(?:[.,]\d+)?\s*[x×]\s*\d+(?:[.,]\d+)?(?:\s*[x×]\s*\d+(?:[.,]\d+)?)?(?:\s*(?:mm|cm|m|milimetros?|centimetros?|metros?))?/gi, " ")
        .replace(/\b\d+(?:[.,]\d+)?\s*(?:mm|cm|m|milimetros?|centimetros?|metros?)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function pareceRespuestaDeCantidad(texto) {
    const limpio = quitarMedidas(texto)
        .replace(/[.!?,;:]+$/g, "")
        .trim();

    if (!limpio) return false;

    const numeroPalabra = "(?:uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieciseis|diecisiete|dieciocho|diecinueve|veinte)";

    // 1 unidad, 2 piezas, 3 llaveros, etc.
    if (/\b\d+\s*(?:unidad(?:es)?|pieza(?:s)?|llavero(?:s)?|figura(?:s)?|producto(?:s)?|caja(?:s)?|impresion(?:es)?|ejemplar(?:es)?|articulo(?:s)?|copias?)\b/i.test(limpio)) {
        return true;
    }

    // quiero 1, necesito 2, seria 1, solo 1, es 1, etc.
    if (/\b(?:cantidad(?:\s+de)?|solo\s+necesito|solamente\s+necesito|solo\s+quiero|solamente\s+quiero|necesito|quiero|quisiera|ocupo|seria|serian|seran|son|es|seria\s+solo|va\s+a\s+ser|van\s+a\s+ser|solo|solamente|unicamente)\s*(?:de\s*)?\d+\b/i.test(limpio)) {
        return true;
    }

    // 1 nada más, 2 nomás, 1 solo.
    if (/\b\d+\s*(?:nada\s+mas|nomas|solamente|solo|unicamente)\b/i.test(limpio)) {
        return true;
    }

    // Respuesta corta: "1", "cantidad 1", "1 de esos", "2 por favor".
    if (/^(?:cantidad\s*:?[ ]*)?\d{1,3}(?:\s+(?:de\s+)?[a-zñ]+(?:\s+[a-zñ]+){0,3})?$/.test(limpio)) {
        const palabrasBloqueadas = /\b(?:modelo|version|año|ano|numero|talla|escala|codigo)\b/i;
        if (!palabrasBloqueadas.test(limpio)) return true;
    }

    // "uno", "una", "solo uno", "una nada más".
    if (new RegExp(`^(?:solo\\s+|solamente\\s+|unicamente\\s+)?${numeroPalabra}(?:\\s+(?:solo|nada\\s+mas|nomas|por\\s+favor))?$`, "i").test(limpio)) {
        return true;
    }

    // "quiero uno", "es una", "seria uno", "solo necesito dos".
    if (new RegExp(
        `\\b(?:cantidad(?:\\s+de)?|solo\\s+necesito|solamente\\s+necesito|solo\\s+quiero|solamente\\s+quiero|necesito|quiero|quisiera|ocupo|seria|serian|seran|son|es|va\\s+a\\s+ser|van\\s+a\\s+ser|solo|solamente|unicamente)\\s*(?:de\\s*)?${numeroPalabra}\\b`,
        "i"
    ).test(limpio)) {
        return true;
    }

    // "una pieza", "un llavero", etc.
    if (/\b(?:un|una)\s+(?:unidad|pieza|llavero|figura|maceta|organizador|soporte|carro|auto|modelo|caja|logo|letrero|trofeo|repuesto|casco|moto|juguete|prototipo|producto|copia)\b/i.test(limpio)) {
        return true;
    }

    return false;
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

    estado.cantidad = mensajesUsuario.some(pareceRespuestaDeCantidad);

    // Si Gemini preguntó por cantidad, aceptamos respuestas naturales
    // como "uno", "una", "1 de esos", "solo una", etc.
    if (!estado.cantidad) {
        for (let i = 1; i < conversation.length; i++) {
            const actual = conversation[i];
            const anterior = conversation[i - 1];

            if (actual?.role !== "user" || anterior?.role !== "assistant") continue;

            const pregunta = normalizar(anterior.message);
            const respuesta = normalizar(actual.message);

            const preguntaCantidad =
                /\b(cuantos|cuantas|cantidad|unidades|piezas|ejemplares|copias)\b/i.test(pregunta) ||
                pregunta.includes("cuanto necesitas") ||
                pregunta.includes("cuanto deseas") ||
                pregunta.includes("cuanto quieres");

            if (preguntaCantidad && pareceRespuestaDeCantidad(respuesta)) {
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
