const campos = [
    "producto",
    "archivo",
    "imagen",
    "color",
    "cantidad",
    "tamaño"
];

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
        .map(m => String(m.message || "").toLowerCase().trim());

    const texto = mensajesUsuario.join("\n");
    const contiene = frase => mensajesUsuario.some(mensaje => mensaje.includes(frase));

    // ======================================
    // PRODUCTO
    // ======================================

    const productos = [
        "llavero", "figura", "maceta", "organizador", "soporte",
        "porta celular", "portacelular", "logo", "letras", "letrero",
        "busto", "casco", "espada", "katana", "auto", "carro",
        "automóvil", "camión", "moto", "avión", "barco", "juguete",
        "prototipo", "pieza", "repuesto", "tapa", "base", "placa",
        "engranaje", "decoración", "caja", "rompecabezas", "rompecabeza",
        "modelo", "miniatura", "trofeo", "fidget", "dragón", "dragon",
        "dinosaurio"
    ];

    estado.producto = productos.some(producto => texto.includes(producto));

    if (!estado.producto) {
        estado.producto = mensajesUsuario.some(mensaje => {
            const coincidencia = mensaje.match(
                /\b(?:quiero|necesito|deseo|busco|cotizar|hacer|imprimir|crear)\s+(?:cotizar\s+|hacer\s+|imprimir\s+|crear\s+)?(?:un|una|unos|unas)\s+([a-záéíóúñ][a-záéíóúñ0-9_-]{2,})/i
            );

            if (!coincidencia) return false;

            const palabrasNoProducto = [
                "cotización", "cotizacion", "información", "informacion",
                "imagen", "foto", "ayuda", "idea", "precio", "presupuesto",
                "consulta", "pregunta", "favor", "algo"
            ];

            return !palabrasNoProducto.includes(coincidencia[1].toLowerCase());
        });
    }

    // ======================================
    // STL / ARCHIVO
    // "archivo" significa que el cliente YA respondió si tiene STL o no.
    // Se revisa mensaje por mensaje para evitar coincidencias falsas entre
    // el final de un mensaje y el inicio del siguiente.
    // ======================================

    const noTieneSTL =
        contiene("no tengo stl") ||
        contiene("no tengo archivo stl") ||
        contiene("no cuento con stl") ||
        contiene("no cuento con archivo stl") ||
        contiene("sin stl") ||
        contiene("sin archivo stl") ||
        contiene("solo tengo una imagen") ||
        contiene("únicamente tengo una imagen") ||
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
            contiene("te envío el stl") ||
            contiene("te envio el stl") ||
            contiene("aquí está el stl") ||
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
            contiene("fotografía") ||
            contiene("fotografia")
        );

    estado.imagen = tieneSTL ? true : tieneImagen;

    // ======================================
    // COLOR
    // ======================================

    const colores = [
        "negro", "negra", "blanco", "blanca", "gris", "grises",
        "gris oscuro", "gris oscura", "gris claro", "gris clara",
        "rosa", "rosado", "rosada", "verde", "verdes", "verde bambú",
        "verde brillante", "café", "cafe", "marrón", "marron"
    ];

    estado.color = colores.some(color => texto.includes(color));

    // ======================================
    // CANTIDAD
    // ======================================

    const palabraNumero = "(?:uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)";

    estado.cantidad = mensajesUsuario.some(mensajeOriginal => {
        const mensaje = mensajeOriginal
            .replace(/[.!?,;:]+$/g, "")
            .trim();

        if (/\b\d+\s*(?:unidad(?:es)?|pieza(?:s)?|llavero(?:s)?|figura(?:s)?|producto(?:s)?|caja(?:s)?|impresi[oó]n(?:es)?|ejemplar(?:es)?)\b/i.test(mensaje)) {
            return true;
        }

        if (/\b(?:cantidad(?:\s+de)?|solo\s+necesito|solamente\s+necesito|necesito|quiero|ser[ií]a|ser[ií]an|ser[aá]n|son|solo|solamente)\s*(?:de\s*)?\d+\b(?!\s*(?:mm|cm|m|mil[ií]metros?|cent[ií]metros?|metros?))/i.test(mensaje)) {
            return true;
        }

        if (/\b\d+\s*(?:nada\s+m[aá]s|nom[aá]s|solamente|solo)\b/i.test(mensaje)) {
            return true;
        }

        if (/^(?:cantidad\s*:?[ ]*)?\d{1,3}$/.test(mensaje)) {
            return true;
        }

        if (new RegExp(`^(?:solo\\s+|solamente\\s+)?${palabraNumero}$`, "i").test(mensaje)) {
            return true;
        }

        if (new RegExp(
            `\\b(?:cantidad(?:\\s+de)?|solo\\s+necesito|solamente\\s+necesito|necesito|quiero|ser[ií]a|ser[ií]an|ser[aá]n|son|solo|solamente)\\s*(?:de\\s*)?${palabraNumero}\\b`,
            "i"
        ).test(mensaje)) {
            return true;
        }

        if (/\b(?:un|una)\s+(?:unidad|pieza|llavero|figura|maceta|organizador|soporte|carro|auto|modelo|caja|logo|letrero|trofeo|repuesto|casco|moto|juguete|prototipo)\b/i.test(mensaje)) {
            return true;
        }

        return false;
    });

    // ======================================
    // TAMAÑO / MEDIDAS
    // ======================================

    estado.tamaño = mensajesUsuario.some(mensaje => {
        const medidaConUnidad = /\b\d+(?:[.,]\d+)?\s*(?:mm|cm|m|mil[ií]metros?|cent[ií]metros?|metros?)\b/i.test(mensaje);
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
