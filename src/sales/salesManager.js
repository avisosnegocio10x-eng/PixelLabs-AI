const campos = ["producto", "archivo", "imagen", "color", "cantidad", "tamaño"];

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

const NUMERO_PALABRA = "(?:uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieciseis|diecisiete|dieciocho|diecinueve|veinte)";

function pareceRespuestaDeCantidad(texto) {
    const limpio = quitarMedidas(texto).replace(/[.!?,;:]+$/g, "").trim();
    if (!limpio) return false;

    if (/\b(?:en\s+total|total(?:\s+de)?)[\s:]*(?:\d+|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|veinte)\b/i.test(limpio)) return true;
    if (/\b(?:\d+|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+en\s+total\b/i.test(limpio)) return true;
    if (/\b\d+\s*(?:unidad(?:es)?|pieza(?:s)?|llavero(?:s)?|figura(?:s)?|producto(?:s)?|caja(?:s)?|impresion(?:es)?|ejemplar(?:es)?|articulo(?:s)?|copias?|muñeco(?:s)?|muneco(?:s)?|tiburon(?:es)?)\b/i.test(limpio)) return true;
    if (/\b(?:cantidad(?:\s+de)?|solo\s+necesito|solamente\s+necesito|solo\s+quiero|necesito|quiero|quisiera|ocupo|seria|serian|seran|son|es|solo|solamente|unicamente)\s*(?:de\s*)?\d+\b/i.test(limpio)) return true;
    if (/\b\d+\s*(?:nada\s+mas|nomas|solamente|solo|unicamente)\b/i.test(limpio)) return true;
    if (/^(?:cantidad\s*:?[ ]*)?\d{1,3}(?:\s+(?:de\s+)?[a-zñ]+(?:\s+[a-zñ]+){0,3})?$/.test(limpio)) return true;
    if (new RegExp(`^(?:solo\\s+|solamente\\s+|unicamente\\s+)?${NUMERO_PALABRA}(?:\\s+(?:solo|nada\\s+mas|nomas|por\\s+favor))?$`, "i").test(limpio)) return true;
    if (new RegExp(`\\b(?:cantidad(?:\\s+de)?|solo\\s+necesito|solamente\\s+necesito|solo\\s+quiero|necesito|quiero|quisiera|ocupo|seria|serian|seran|son|es|solo|solamente|unicamente)\\s*(?:de\\s*)?${NUMERO_PALABRA}\\b`, "i").test(limpio)) return true;
    if (/\b(?:un|una)\s+(?:unidad|pieza|llavero|figura|maceta|organizador|soporte|carro|auto|modelo|caja|logo|letrero|trofeo|repuesto|casco|moto|juguete|prototipo|producto|copia|muñeco|muneco|tiburon)\b/i.test(limpio)) return true;

    return false;
}

const PRODUCTOS = [
    "llavero", "figura", "maceta", "organizador", "soporte", "porta celular",
    "portacelular", "logo", "letras", "letrero", "busto", "casco", "espada",
    "katana", "auto", "carro", "automovil", "camion", "moto", "avion", "barco",
    "juguete", "prototipo", "pieza", "repuesto", "tapa", "base", "placa",
    "engranaje", "decoracion", "caja", "rompecabezas", "rompecabeza", "modelo",
    "miniatura", "trofeo", "fidget", "dragon", "dinosaurio", "capibara", "orca",
    "gato", "estrella", "cubo", "portalapices", "joyero", "ballena", "mariposa",
    "rotulo", "medalla", "premio", "estuche", "contenedor", "adaptador", "gancho",
    "perchero", "adorno", "muñeco", "muneco", "muñequitos", "munequitos", "tiburon",
    "tiburones", "baby shark", "baby sharks"
];

const COLORES_DISPONIBLES = [
    "negro", "negra", "blanco", "blanca", "gris", "grises", "gris oscuro",
    "gris oscura", "gris claro", "gris clara", "rosa", "rosado", "rosada",
    "turquesa", "verde", "verdes", "verde bambu", "verde brillante", "cafe", "marron"
];

const COLORES_NO_DISPONIBLES = [
    "azul", "azul marino", "azul cielo", "celeste", "rojo", "amarillo", "naranja",
    "morado", "violeta", "fucsia", "beige", "crema", "dorado", "oro", "plateado",
    "plata", "cobre", "bronce", "transparente"
];

function obtenerEstadoConversacion(conversation) {
    const estado = { producto: false, archivo: false, imagen: false, color: false, cantidad: false, tamaño: false };

    const mensajesUsuario = conversation
        .filter(m => m.role === "user")
        .map(m => normalizar(m.message));

    const texto = mensajesUsuario.join("\n");
    const contiene = frase => mensajesUsuario.some(mensaje => mensaje.includes(normalizar(frase)));

    // PRODUCTO
    estado.producto = PRODUCTOS.some(producto => texto.includes(producto));

    if (!estado.producto) {
        estado.producto = mensajesUsuario.some(mensaje => {
            const match = mensaje.match(/\b(?:quiero|quisiera|necesito|deseo|busco|ocupo|cotizar|hacer|imprimir|crear|me gustaria)\s+(?:(?:un|una|unos|unas|el|la|los|las)\s+)?([a-zñ][a-zñ0-9_-]{1,}(?:\s+[a-zñ][a-zñ0-9_-]{1,}){0,5})/i);
            if (!match) return false;
            return !/^(cotizacion|informacion|imagen|foto|ayuda|idea|precio|presupuesto|consulta|pregunta|favor|algo|nombre|color|cantidad|medida|tamano|stl|archivo)\b/i.test(match[1]);
        });
    }

    // STL
    const noTieneSTL =
        contiene("no tengo stl") || contiene("no tengo archivo stl") ||
        contiene("no cuento con stl") || contiene("no cuento con archivo stl") ||
        contiene("sin stl") || contiene("sin archivo stl") ||
        contiene("solo tengo una imagen") || contiene("unicamente tengo una imagen") ||
        contiene("solo cuento con una imagen");

    const tieneSTL = !noTieneSTL && (
        contiene("tengo stl") || contiene("cuento con stl") ||
        contiene("tengo archivo stl") || contiene("cuento con archivo stl") ||
        contiene("adjunto el stl") || contiene("adjunto stl") ||
        contiene("te envio el stl") || contiene("aqui esta el stl")
    );

    estado.archivo = tieneSTL || noTieneSTL;

    // IMAGEN
    const noTieneImagen =
        contiene("no tengo imagen") || contiene("no tengo foto") ||
        contiene("sin imagen") || contiene("sin foto") ||
        contiene("no cuento con imagen") || contiene("no cuento con foto");

    const tieneImagen = !noTieneImagen && (
        contiene("[imagen]") || contiene("imagen") || contiene("foto") || contiene("fotografia")
    );

    estado.imagen = tieneSTL ? true : tieneImagen;

    // COLOR
    const indicesDisponibles = [];
    const indicesNoDisponibles = [];

    mensajesUsuario.forEach((mensaje, indice) => {
        if (COLORES_DISPONIBLES.some(color => mensaje.includes(color))) indicesDisponibles.push(indice);
        if (COLORES_NO_DISPONIBLES.some(color => mensaje.includes(color))) indicesNoDisponibles.push(indice);
    });

    if (indicesDisponibles.length > 0) {
        if (indicesNoDisponibles.length === 0) {
            estado.color = true;
        } else {
            const ultimoNoDisponible = Math.max(...indicesNoDisponibles);
            const reemplazoPosterior = indicesDisponibles.some(indice => indice > ultimoNoDisponible);
            const reemplazoEnMismoMensaje = mensajesUsuario.some(mensaje =>
                COLORES_NO_DISPONIBLES.some(color => mensaje.includes(color)) &&
                COLORES_DISPONIBLES.some(color => mensaje.includes(color)) &&
                /\b(?:por|cambia|cambiar|reemplaza|reemplazar|sustituye|sustituir)\b/i.test(mensaje)
            );
            estado.color = reemplazoPosterior || reemplazoEnMismoMensaje;
        }
    }

    // CANTIDAD
    estado.cantidad = mensajesUsuario.some(pareceRespuestaDeCantidad);

    if (!estado.cantidad) {
        for (let i = 1; i < conversation.length; i++) {
            const actual = conversation[i];
            const anterior = conversation[i - 1];
            if (actual?.role !== "user" || anterior?.role !== "assistant") continue;

            const pregunta = normalizar(anterior.message);
            const respuesta = normalizar(actual.message);
            const preguntaCantidad = /\b(cuantos|cuantas|cantidad|unidades|piezas|ejemplares|copias)\b/i.test(pregunta);
            if (preguntaCantidad && pareceRespuestaDeCantidad(respuesta)) {
                estado.cantidad = true;
                break;
            }
        }
    }

    // TAMAÑO
    estado.tamaño = mensajesUsuario.some(mensaje =>
        /\b\d+(?:[.,]\d+)?\s*(?:mm|cm|m|milimetros?|centimetros?|metros?)\b/i.test(mensaje) ||
        /\b\d+(?:[.,]\d+)?\s*[x×]\s*\d+(?:[.,]\d+)?(?:\s*[x×]\s*\d+(?:[.,]\d+)?)?(?:\s*(?:mm|cm|m|milimetros?|centimetros?|metros?))?\b/i.test(mensaje)
    );

    return estado;
}

function obtenerCamposFaltantes(estado) {
    return campos.filter(campo => !estado[campo]);
}

module.exports = { obtenerEstadoConversacion, obtenerCamposFaltantes };
