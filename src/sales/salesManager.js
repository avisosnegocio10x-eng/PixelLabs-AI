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

    const texto = conversation
        .filter(m => m.role === "user")
        .map(m => String(m.message || "").toLowerCase())
        .join(" ");

    // ======================================
    // PRODUCTO
    // ======================================

    const productos = [
        "llavero",
        "figura",
        "maceta",
        "organizador",
        "soporte",
        "porta celular",
        "portacelular",
        "logo",
        "letras",
        "letrero",
        "busto",
        "casco",
        "espada",
        "katana",
        "auto",
        "carro",
        "automóvil",
        "camión",
        "moto",
        "avión",
        "barco",
        "juguete",
        "prototipo",
        "pieza",
        "repuesto",
        "tapa",
        "base",
        "placa",
        "engranaje",
        "decoración",
        "caja",
        "rompecabezas",
        "rompecabeza",
        "modelo",
        "miniatura",
        "trofeo",
        "nombre",
        "fidget",
        "dragón",
        "dragon",
        "dinosaurio"
    ];

    estado.producto = productos.some(producto => texto.includes(producto));

    // Si el producto no está en la lista, detectamos frases naturales
    // como "quiero cotizar una caja" o "necesito hacer un soporte".
    if (!estado.producto) {
        const coincidenciaProducto = texto.match(
            /\b(?:quiero|necesito|deseo|busco|cotizar|hacer|imprimir|crear)\s+(?:cotizar\s+|hacer\s+|imprimir\s+|crear\s+)?(?:un|una|unos|unas)\s+([a-záéíóúñ][a-záéíóúñ0-9_-]{2,})/i
        );

        const palabrasNoProducto = [
            "cotización",
            "cotizacion",
            "información",
            "informacion",
            "imagen",
            "foto",
            "ayuda",
            "idea",
            "precio",
            "presupuesto",
            "consulta",
            "pregunta",
            "favor",
            "algo"
        ];

        if (
            coincidenciaProducto &&
            !palabrasNoProducto.includes(coincidenciaProducto[1].toLowerCase())
        ) {
            estado.producto = true;
        }
    }

    // ======================================
    // STL / ARCHIVO
    // Aquí "archivo" significa que el cliente YA respondió
    // si tiene o no tiene STL.
    // ======================================

    const noTieneSTL =
        texto.includes("no tengo stl") ||
        texto.includes("no tengo archivo stl") ||
        texto.includes("no cuento con stl") ||
        texto.includes("no cuento con archivo stl") ||
        texto.includes("sin stl") ||
        texto.includes("sin archivo stl") ||
        texto.includes("solo tengo una imagen") ||
        texto.includes("únicamente tengo una imagen") ||
        texto.includes("unicamente tengo una imagen") ||
        texto.includes("solo cuento con una imagen");

    const tieneSTL =
        !noTieneSTL && (
            texto.includes("tengo stl") ||
            texto.includes("cuento con stl") ||
            texto.includes("tengo archivo stl") ||
            texto.includes("cuento con archivo stl") ||
            texto.includes("adjunto el stl") ||
            texto.includes("adjunto stl") ||
            texto.includes("te envío el stl") ||
            texto.includes("te envio el stl") ||
            texto.includes("aquí está el stl") ||
            texto.includes("aqui esta el stl")
        );

    estado.archivo = tieneSTL || noTieneSTL;

    // ======================================
    // IMAGEN
    // Si ya tiene STL, la imagen no es obligatoria.
    // Si no tiene STL, sí necesitamos una referencia visual.
    // ======================================

    const noTieneImagen =
        texto.includes("no tengo imagen") ||
        texto.includes("no tengo foto") ||
        texto.includes("sin imagen") ||
        texto.includes("sin foto") ||
        texto.includes("no cuento con imagen") ||
        texto.includes("no cuento con foto");

    const tieneImagen =
        !noTieneImagen && (
            texto.includes("[imagen]") ||
            texto.includes("imagen") ||
            texto.includes("foto") ||
            texto.includes("fotografía") ||
            texto.includes("fotografia")
        );

    if (tieneSTL) {
        // STL disponible: el requisito de imagen se considera satisfecho.
        estado.imagen = true;
    } else {
        estado.imagen = tieneImagen;
    }

    // ======================================
    // COLOR
    // ======================================

    const colores = [
        "negro",
        "blanco",
        "gris",
        "gris oscuro",
        "gris claro",
        "rosa",
        "rosado",
        "verde",
        "verde bambú",
        "verde brillante",
        "café",
        "cafe",
        "marrón",
        "marron"
    ];

    estado.color = colores.some(color => texto.includes(color));

    // ======================================
    // CANTIDAD
    // No usamos "cualquier número" porque una medida como 20 cm
    // no debe confundirse con 20 unidades.
    // ======================================

    const cantidadConUnidad = /\b\d+\s*(?:unidad(?:es)?|pieza(?:s)?|llavero(?:s)?|figura(?:s)?|producto(?:s)?|caja(?:s)?|impresi[oó]n(?:es)?|ejemplar(?:es)?)\b/i.test(texto);

    const cantidadExplicita = /\b(?:cantidad(?:\s+de)?|solo\s+necesito|solamente\s+necesito|necesito|quiero|ser[ií]an|ser[aá]n|son)\s*(?:de\s*)?\d+\b/i.test(texto);

    const singularExplicito = /\b(?:un|una)\s+(?:unidad|pieza|llavero|figura|maceta|organizador|soporte|carro|auto|modelo|caja|logo|letrero|trofeo|repuesto|casco|moto|juguete|prototipo)\b/i.test(texto);

    estado.cantidad =
        cantidadConUnidad ||
        cantidadExplicita ||
        singularExplicito ||
        texto.includes("solo una") ||
        texto.includes("solamente una") ||
        texto.includes("una unidad");

    // ======================================
    // TAMAÑO / MEDIDAS
    // ======================================

    const medidaConUnidad = /\b\d+(?:[.,]\d+)?\s*(?:mm|cm|m|mil[ií]metros?|cent[ií]metros?|metros?)\b/i.test(texto);

    const medidaMultiplicada = /\b\d+(?:[.,]\d+)?\s*[x×]\s*\d+(?:[.,]\d+)?(?:\s*[x×]\s*\d+(?:[.,]\d+)?)?\b/i.test(texto);

    estado.tamaño = medidaConUnidad || medidaMultiplicada;

    return estado;
}

function obtenerCamposFaltantes(estado) {
    return campos.filter(campo => !estado[campo]);
}

module.exports = {
    obtenerEstadoConversacion,
    obtenerCamposFaltantes
};
