// ================================
// PIXELLABS - QUOTE EXTRACTOR V5
// ================================

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

function extraerCantidadMensaje(texto) {
    const limpio = quitarMedidas(texto)
        .replace(/[.!?,;:]+$/g, "")
        .trim();

    if (!limpio) return null;

    const numerosPalabra = {
        uno: "1", una: "1", dos: "2", tres: "3", cuatro: "4",
        cinco: "5", seis: "6", siete: "7", ocho: "8", nueve: "9",
        diez: "10", once: "11", doce: "12", trece: "13",
        catorce: "14", quince: "15", dieciseis: "16", diecisiete: "17",
        dieciocho: "18", diecinueve: "19", veinte: "20"
    };

    const palabraNumero = "(uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieciseis|diecisiete|dieciocho|diecinueve|veinte)";

    let match = limpio.match(
        /\b(\d+)\s*(?:unidad(?:es)?|pieza(?:s)?|llavero(?:s)?|figura(?:s)?|producto(?:s)?|caja(?:s)?|impresion(?:es)?|ejemplar(?:es)?|articulo(?:s)?|copias?)\b/i
    );
    if (match) return match[1];

    match = limpio.match(
        /\b(?:cantidad(?:\s+de)?|solo\s+necesito|solamente\s+necesito|solo\s+quiero|solamente\s+quiero|necesito|quiero|quisiera|ocupo|seria|serian|seran|son|es|va\s+a\s+ser|van\s+a\s+ser|solo|solamente|unicamente)\s*(?:de\s*)?(\d+)\b/i
    );
    if (match) return match[1];

    match = limpio.match(/\b(\d+)\s*(?:nada\s+mas|nomas|solamente|solo|unicamente)\b/i);
    if (match) return match[1];

    if (/^(?:cantidad\s*:?[ ]*)?\d{1,3}(?:\s+(?:de\s+)?[a-zñ]+(?:\s+[a-zñ]+){0,3})?$/.test(limpio)) {
        if (!/\b(?:modelo|version|año|ano|numero|talla|escala|codigo)\b/i.test(limpio)) {
            const numero = limpio.match(/\d+/);
            if (numero) return numero[0];
        }
    }

    match = limpio.match(
        new RegExp(`\\b(?:cantidad(?:\\s+de)?|solo\\s+necesito|solamente\\s+necesito|solo\\s+quiero|solamente\\s+quiero|necesito|quiero|quisiera|ocupo|seria|serian|seran|son|es|va\\s+a\\s+ser|van\\s+a\\s+ser|solo|solamente|unicamente)\\s*(?:de\\s*)?${palabraNumero}\\b`, "i")
    );
    if (match) return numerosPalabra[match[1].toLowerCase()] || null;

    match = limpio.match(new RegExp(`^(?:solo\\s+|solamente\\s+|unicamente\\s+)?${palabraNumero}(?:\\s+(?:solo|nada\\s+mas|nomas|por\\s+favor))?$`, "i"));
    if (match) return numerosPalabra[match[1].toLowerCase()] || null;

    if (/\b(?:un|una)\s+(?:unidad|pieza|llavero|figura|maceta|organizador|soporte|carro|auto|modelo|caja|logo|letrero|trofeo|repuesto|casco|moto|juguete|prototipo|producto|copia)\b/i.test(limpio)) {
        return "1";
    }

    return null;
}

function extraerCotizacion(conversation) {
    const mensajesUsuario = conversation
        .filter(msg => msg.role === "user")
        .map(msg => String(msg.message || ""));

    const mensajesTexto = mensajesUsuario.map(mensaje => normalizar(mensaje));
    const texto = mensajesTexto.join("\n");
    const contiene = frase => mensajesTexto.some(mensaje => mensaje.includes(normalizar(frase)));

    // ======================================
    // COLORES
    // ======================================

    const coloresDisponibles = [
        "negro", "negra", "blanco", "blanca", "gris", "gris oscuro",
        "gris oscura", "gris claro", "gris clara", "rosa", "rosado",
        "rosada", "fucsia", "turquesa", "verde", "verde brillante",
        "verde bambu", "verde militar", "verde oliva", "rojo", "azul",
        "azul marino", "azul cielo", "celeste", "amarillo", "naranja",
        "morado", "violeta", "cafe", "marron", "beige", "crema",
        "dorado", "oro", "plateado", "plata", "cobre", "bronce",
        "transparente"
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
    // MATERIAL
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
        "portalapices", "joyero", "ballena", "mariposa", "rotulo",
        "medalla", "premio", "estuche", "contenedor", "adaptador",
        "gancho", "perchero", "adorno"
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
        contiene("te envio el stl") ||
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
        contiene("fotografia")
            ? "Sí"
            : "No";

    // ======================================
    // CANTIDAD
    // ======================================

    let cantidad = "No especificada";

    for (let i = mensajesTexto.length - 1; i >= 0; i--) {
        const valor = extraerCantidadMensaje(mensajesTexto[i]);
        if (valor) {
            cantidad = valor;
            break;
        }
    }

    // ======================================
    // MEDIDAS
    // ======================================

    let medidas = "No especificadas";

    for (const mensaje of mensajesTexto) {
        let match = mensaje.match(
            /(\d+(?:[.,]\d+)?)\s*(?:cm|centimetros?).*?(\d+(?:[.,]\d+)?)\s*(?:cm|centimetros?)/i
        );

        if (match) {
            medidas = `${match[1]} cm x ${match[2]} cm`;
            break;
        }

        match = mensaje.match(
            /(\d+(?:[.,]\d+)?)\s*(mm|cm|m|milimetros?|centimetros?|metros?)\b/i
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
