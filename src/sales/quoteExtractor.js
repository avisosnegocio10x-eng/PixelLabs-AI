// ================================
// PIXELLABS - QUOTE EXTRACTOR V4
// ================================

function extraerCotizacion(conversation) {
    const mensajesUsuario = conversation
        .filter(msg => msg.role === "user")
        .map(msg => String(msg.message || ""));

    const mensajesTexto = mensajesUsuario.map(mensaje => mensaje.toLowerCase().trim());
    const texto = mensajesTexto.join("\n");
    const contiene = frase => mensajesTexto.some(mensaje => mensaje.includes(frase));

    // ======================================
    // COLORES DISPONIBLES
    // ======================================

    const coloresDisponibles = [
        "negro", "negra", "blanco", "blanca", "gris", "gris oscuro",
        "gris oscura", "gris claro", "gris clara", "rosa", "rosado",
        "rosada", "fucsia", "turquesa", "verde", "verde brillante",
        "verde bambú", "verde militar", "verde oliva", "rojo", "azul",
        "azul marino", "azul cielo", "celeste", "amarillo", "naranja",
        "morado", "violeta", "café", "cafe", "marrón", "marron",
        "beige", "crema", "dorado", "oro", "plateado", "plata",
        "cobre", "bronce", "transparente"
    ];

    let ultimoColor = null;

    mensajesTexto.forEach(mensaje => {
        coloresDisponibles.forEach(color => {
            if (mensaje.includes(color)) {
                ultimoColor = color.charAt(0).toUpperCase() + color.slice(1);
            }
        });
    });

    // ======================================
    // MATERIALES
    // ======================================

    const materiales = [
        "pla silk", "pla matte", "pla", "petg", "abs", "asa",
        "tpu", "resina", "carbon fiber", "wood"
    ];

    let material = "PLA";

    materiales.forEach(item => {
        if (texto.includes(item)) {
            material = item.toUpperCase();
        }
    });

    // ======================================
    // PRODUCTOS
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

    let producto = "No especificado";

    productos.forEach(item => {
        if (texto.includes(item)) {
            producto = item.charAt(0).toUpperCase() + item.slice(1);
        }
    });

    // ======================================
    // STL
    // ======================================

    const noTieneSTL =
        contiene("no tengo archivo stl") ||
        contiene("no tengo stl") ||
        contiene("no cuento con archivo stl") ||
        contiene("no cuento con stl") ||
        contiene("sin archivo stl") ||
        contiene("sin stl") ||
        contiene("únicamente tengo una imagen") ||
        contiene("unicamente tengo una imagen") ||
        contiene("solo tengo una imagen") ||
        contiene("solo cuento con una imagen");

    let stl = "No";

    if (!noTieneSTL && (
        contiene("tengo archivo stl") ||
        contiene("tengo stl") ||
        contiene("cuento con archivo stl") ||
        contiene("cuento con stl") ||
        contiene("adjunto el stl") ||
        contiene("adjunto stl") ||
        contiene("te envío el stl") ||
        contiene("te envio el stl") ||
        contiene("aquí está el stl") ||
        contiene("aqui esta el stl")
    )) {
        stl = "Sí";
    }

    // ======================================
    // IMAGEN
    // ======================================

    const imagen =
        contiene("[imagen]") ||
        contiene("imagen") ||
        contiene("foto") ||
        contiene("fotografía") ||
        contiene("fotografia")
            ? "Sí"
            : "No";

    // ======================================
    // CANTIDAD
    // ======================================

    let cantidad = "No especificada";

    const numerosPalabra = {
        uno: "1",
        una: "1",
        dos: "2",
        tres: "3",
        cuatro: "4",
        cinco: "5",
        seis: "6",
        siete: "7",
        ocho: "8",
        nueve: "9",
        diez: "10"
    };

    const palabraNumero = "(uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)";

    for (let i = mensajesTexto.length - 1; i >= 0; i--) {
        const mensaje = mensajesTexto[i]
            .replace(/[.!?,;:]+$/g, "")
            .trim();

        let match = mensaje.match(
            /\b(\d+)\s*(?:unidad(?:es)?|pieza(?:s)?|llavero(?:s)?|figura(?:s)?|producto(?:s)?|caja(?:s)?|impresi[oó]n(?:es)?|ejemplar(?:es)?)\b/i
        );

        if (match) {
            cantidad = match[1];
            break;
        }

        match = mensaje.match(
            /\b(?:cantidad(?:\s+de)?|solo\s+necesito|solamente\s+necesito|necesito|quiero|ser[ií]a|ser[ií]an|ser[aá]n|son|solo|solamente)\s*(?:de\s*)?(\d+)\b(?!\s*(?:mm|cm|m|mil[ií]metros?|cent[ií]metros?|metros?))/i
        );

        if (match) {
            cantidad = match[1];
            break;
        }

        match = mensaje.match(/\b(\d+)\s*(?:nada\s+m[aá]s|nom[aá]s|solamente|solo)\b/i);

        if (match) {
            cantidad = match[1];
            break;
        }

        if (/^(?:cantidad\s*:?[ ]*)?\d{1,3}$/.test(mensaje)) {
            cantidad = mensaje.match(/\d+/)[0];
            break;
        }

        match = mensaje.match(
            new RegExp(`\\b(?:cantidad(?:\\s+de)?|solo\\s+necesito|solamente\\s+necesito|necesito|quiero|ser[ií]a|ser[ií]an|ser[aá]n|son|solo|solamente)\\s*(?:de\\s*)?${palabraNumero}\\b`, "i")
        );

        if (match) {
            cantidad = numerosPalabra[match[1].toLowerCase()] || "1";
            break;
        }

        match = mensaje.match(new RegExp(`^(?:solo\\s+|solamente\\s+)?${palabraNumero}$`, "i"));

        if (match) {
            cantidad = numerosPalabra[match[1].toLowerCase()];
            break;
        }

        if (/\b(?:un|una)\s+(?:unidad|pieza|llavero|figura|maceta|organizador|soporte|carro|auto|modelo|caja|logo|letrero|trofeo|repuesto|casco|moto|juguete|prototipo)\b/i.test(mensaje)) {
            cantidad = "1";
            break;
        }
    }

    // ======================================
    // MEDIDAS
    // ======================================

    let medidas = "No especificadas";

    for (const mensaje of mensajesTexto) {
        let match = mensaje.match(
            /(\d+(?:[.,]\d+)?)\s*(?:cm|cent[ií]metros?).*?(\d+(?:[.,]\d+)?)\s*(?:cm|cent[ií]metros?)/i
        );

        if (match) {
            medidas = `${match[1]} cm x ${match[2]} cm`;
            break;
        }

        match = mensaje.match(
            /(\d+(?:[.,]\d+)?)\s*(mm|cm|m|mil[ií]metros?|cent[ií]metros?|metros?)\b/i
        );

        if (match) {
            medidas = `${match[1]} ${match[2]}`;
            break;
        }

        match = mensaje.match(
            /(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)(?:\s*[x×]\s*(\d+(?:[.,]\d+)?))?/i
        );

        if (match) {
            medidas = match[3]
                ? `${match[1]} x ${match[2]} x ${match[3]}`
                : `${match[1]} x ${match[2]}`;
            break;
        }
    }

    return {
        producto,
        color: ultimoColor || "No especificado",
        material,
        cantidad,
        medidas,
        imagen,
        stl
    };
}

module.exports = {
    extraerCotizacion
};
