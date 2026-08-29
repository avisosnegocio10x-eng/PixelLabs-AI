// ================================
// PIXELLABS - QUOTE EXTRACTOR V6
// ================================

function normalizar(valor) {
    return String(valor || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
}

function titulo(texto) {
    return texto
        .split(/\s+/)
        .filter(Boolean)
        .map((p, i) => {
            if (["de", "del", "la", "el", "y"].includes(p) && i > 0) return p;
            return p.charAt(0).toUpperCase() + p.slice(1);
        })
        .join(" ");
}

function quitarMedidas(texto) {
    return normalizar(texto)
        .replace(/\b\d+(?:[.,]\d+)?\s*[x×]\s*\d+(?:[.,]\d+)?(?:\s*[x×]\s*\d+(?:[.,]\d+)?)?(?:\s*(?:mm|cm|m|milimetros?|centimetros?|metros?))?/gi, " ")
        .replace(/\b\d+(?:[.,]\d+)?\s*(?:mm|cm|m|milimetros?|centimetros?|metros?)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
}

const NUMEROS = {
    uno: "1", una: "1", dos: "2", tres: "3", cuatro: "4", cinco: "5",
    seis: "6", siete: "7", ocho: "8", nueve: "9", diez: "10", once: "11",
    doce: "12", trece: "13", catorce: "14", quince: "15", dieciseis: "16",
    diecisiete: "17", dieciocho: "18", diecinueve: "19", veinte: "20"
};
const PALABRA_NUMERO = "(uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieciseis|diecisiete|dieciocho|diecinueve|veinte)";

function valorNumero(valor) {
    if (!valor) return null;
    return /^\d+$/.test(valor) ? valor : (NUMEROS[valor] || null);
}

function extraerCantidadMensaje(texto) {
    const limpio = quitarMedidas(texto).replace(/[.!?,;:]+$/g, "").trim();
    if (!limpio) return null;

    let match = limpio.match(/\b(?:en\s+total|total(?:\s+de)?)[\s:]*(\d+)\b/i);
    if (match) return match[1];

    match = limpio.match(/\b(\d+)\s+en\s+total\b/i);
    if (match) return match[1];

    match = limpio.match(new RegExp(`\\b(?:en\\s+total|total(?:\\s+de)?)[\\s:]*${PALABRA_NUMERO}\\b`, "i"));
    if (match) return valorNumero(match[1]);

    match = limpio.match(new RegExp(`\\b${PALABRA_NUMERO}\\s+en\\s+total\\b`, "i"));
    if (match) return valorNumero(match[1]);

    match = limpio.match(/\b(\d+)\s*(?:tiburon(?:es)?|muñeco(?:s)?|muneco(?:s)?|muñequito(?:s)?|munequito(?:s)?|unidad(?:es)?|pieza(?:s)?|llavero(?:s)?|figura(?:s)?|producto(?:s)?|caja(?:s)?|impresion(?:es)?|ejemplar(?:es)?|articulo(?:s)?|copias?)\b/i);
    if (match) return match[1];

    match = limpio.match(/\b(?:serian|seran|son|cantidad(?:\s+de)?|solo\s+necesito|solamente\s+necesito|solo\s+quiero|necesito|quiero|quisiera|ocupo|seria|es|solo|solamente|unicamente)\s*(?:de\s*)?(\d+)\b/i);
    if (match) return match[1];

    match = limpio.match(/\b(\d+)\s*(?:nada\s+mas|nomas|solamente|solo|unicamente)\b/i);
    if (match) return match[1];

    match = limpio.match(new RegExp(`\\b(?:serian|seran|son|cantidad(?:\\s+de)?|solo\\s+necesito|solamente\\s+necesito|solo\\s+quiero|necesito|quiero|quisiera|ocupo|seria|es|solo|solamente|unicamente)\\s*(?:de\\s*)?${PALABRA_NUMERO}\\b`, "i"));
    if (match) return valorNumero(match[1]);

    if (/^(?:cantidad\s*:?[ ]*)?\d{1,3}$/.test(limpio)) {
        const numero = limpio.match(/\d+/);
        return numero ? numero[0] : null;
    }

    match = limpio.match(new RegExp(`^(?:solo\\s+|solamente\\s+|unicamente\\s+)?${PALABRA_NUMERO}$`, "i"));
    if (match) return valorNumero(match[1]);

    return null;
}

const COLORES = [
    { nombre: "Gris oscuro", aliases: ["gris oscuro", "gris oscura"] },
    { nombre: "Verde brillante", aliases: ["verde brillante"] },
    { nombre: "Verde bambú", aliases: ["verde bambu"] },
    { nombre: "Turquesa", aliases: ["turquesa"] },
    { nombre: "Negro", aliases: ["negro", "negra"] },
    { nombre: "Blanco", aliases: ["blanco", "blanca"] },
    { nombre: "Gris", aliases: ["gris", "grises"] },
    { nombre: "Rosa", aliases: ["rosa", "rosado", "rosada"] },
    { nombre: "Verde", aliases: ["verde", "verdes"] },
    { nombre: "Café", aliases: ["cafe", "marron"] }
];

function detectarColores(mensaje) {
    const encontrados = [];
    COLORES.forEach(color => {
        const pos = Math.min(...color.aliases.map(alias => {
            const i = mensaje.indexOf(alias);
            return i === -1 ? Number.POSITIVE_INFINITY : i;
        }));
        if (Number.isFinite(pos)) encontrados.push({ ...color, pos });
    });
    return encontrados.sort((a, b) => a.pos - b.pos);
}

function extraerColores(mensajes) {
    const seleccion = [];

    for (const mensaje of mensajes) {
        const coloresMensaje = detectarColores(mensaje);

        const reemplazo = mensaje.match(/\b(?:cambia|cambiar|cambialo|cambiala|reemplaza|reemplazar|sustituye|sustituir).*?\bpor\s+([a-zñ ]{3,30})/i);
        if (reemplazo) {
            const nuevos = detectarColores(reemplazo[1]);
            nuevos.forEach(c => {
                if (!seleccion.includes(c.nombre)) seleccion.push(c.nombre);
            });
            continue;
        }

        coloresMensaje.forEach(c => {
            if (!seleccion.includes(c.nombre)) seleccion.push(c.nombre);
        });
    }

    if (seleccion.some(c => c === "Verde brillante" || c === "Verde bambú")) {
        const idx = seleccion.indexOf("Verde");
        if (idx !== -1) seleccion.splice(idx, 1);
    }

    if (seleccion.length === 0) return "No especificado";
    if (seleccion.length === 1) return seleccion[0];
    if (seleccion.length === 2) return `${seleccion[0]} y ${seleccion[1]}`;
    return `${seleccion.slice(0, -1).join(", ")} y ${seleccion[seleccion.length - 1]}`;
}

function extraerProducto(mensajes) {
    const texto = mensajes.join("\n");

    if (/baby\s+sharks?/i.test(texto)) {
        if (/muñequitos?|munequitos?|muñecos?|munecos?/i.test(texto)) return "Muñequitos de Baby Shark";
        if (/tiburones?|tiburon/i.test(texto)) return "Tiburones de Baby Shark";
        return "Baby Shark";
    }

    const conocidos = [
        "llavero", "figura", "maceta", "organizador", "soporte", "porta celular",
        "logo", "letrero", "busto", "casco", "espada", "katana", "auto", "carro",
        "moto", "avion", "barco", "juguete", "prototipo", "pieza", "repuesto",
        "tapa", "base", "placa", "engranaje", "decoracion", "caja", "rompecabezas",
        "modelo", "miniatura", "trofeo", "fidget", "dragon", "dinosaurio", "capibara",
        "orca", "gato", "estrella", "cubo", "portalapices", "joyero", "ballena",
        "mariposa", "rotulo", "medalla", "estuche", "contenedor", "adaptador", "gancho",
        "perchero", "adorno", "muñeco", "muneco", "muñequito", "munequito", "tiburon"
    ];

    for (const item of conocidos) {
        if (texto.includes(item)) return titulo(item);
    }

    for (const mensaje of mensajes) {
        const match = mensaje.match(/\b(?:quiero|quisiera|necesito|deseo|busco|ocupo|cotizar|hacer|imprimir|crear|me gustaria)\s+(?:(?:un|una|unos|unas|el|la|los|las)\s+)?(.+?)(?=\s+(?:serian|seria|seran|son|cada|cantidad|color|de\s+color|mide|miden|medida|medidas|tamano|tamaño|con\s+archivo|sin\s+archivo|no\s+cuento|tengo\s+stl)|$)/i);
        if (match) {
            const candidato = match[1].replace(/\s+/g, " ").trim();
            if (candidato.length >= 2 && candidato.length <= 80) return titulo(candidato);
        }
    }

    return "No especificado";
}

function extraerMedidas(mensajes) {
    for (const mensaje of mensajes) {
        let match = mensaje.match(/\b(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)(?:\s*[x×]\s*(\d+(?:[.,]\d+)?))?\s*(mm|cm|m|milimetros?|centimetros?|metros?)?\b/i);
        if (match) {
            const unidadRaw = match[4] || "";
            let unidad = unidadRaw;
            if (/centimetro/i.test(unidadRaw)) unidad = "cm";
            else if (/milimetro/i.test(unidadRaw)) unidad = "mm";
            else if (/metro/i.test(unidadRaw) && unidadRaw !== "m") unidad = "m";

            return match[3]
                ? `${match[1]}${unidad ? ` ${unidad}` : ""} x ${match[2]}${unidad ? ` ${unidad}` : ""} x ${match[3]}${unidad ? ` ${unidad}` : ""}`
                : `${match[1]}${unidad ? ` ${unidad}` : ""} x ${match[2]}${unidad ? ` ${unidad}` : ""}`;
        }

        match = mensaje.match(/(\d+(?:[.,]\d+)?)\s*(cm|mm|m|centimetros?|milimetros?|metros?).*?(\d+(?:[.,]\d+)?)\s*(cm|mm|m|centimetros?|milimetros?|metros?)/i);
        if (match) {
            const u1 = /centimetro/i.test(match[2]) ? "cm" : /milimetro/i.test(match[2]) ? "mm" : "m";
            const u2 = /centimetro/i.test(match[4]) ? "cm" : /milimetro/i.test(match[4]) ? "mm" : "m";
            return `${match[1]} ${u1} x ${match[3]} ${u2}`;
        }

        match = mensaje.match(/(\d+(?:[.,]\d+)?)\s*(cm|mm|m|centimetros?|milimetros?|metros?)\b/i);
        if (match) {
            const u = /centimetro/i.test(match[2]) ? "cm" : /milimetro/i.test(match[2]) ? "mm" : "m";
            return `${match[1]} ${u}`;
        }
    }
    return "No especificadas";
}

function extraerCotizacion(conversation) {
    const mensajesUsuario = conversation
        .filter(msg => msg.role === "user")
        .map(msg => normalizar(msg.message));

    const contiene = frase => mensajesUsuario.some(mensaje => mensaje.includes(normalizar(frase)));

    let cantidad = "No especificada";
    for (let i = mensajesUsuario.length - 1; i >= 0; i--) {
        const valor = extraerCantidadMensaje(mensajesUsuario[i]);
        if (valor) {
            cantidad = valor;
            break;
        }
    }

    const noTieneSTL =
        contiene("no tengo archivo stl") || contiene("no tengo stl") ||
        contiene("no cuento con archivo stl") || contiene("no cuento con stl") ||
        contiene("sin archivo stl") || contiene("sin stl") ||
        contiene("unicamente tengo una imagen") || contiene("solo tengo una imagen") ||
        contiene("solo cuento con una imagen");

    const tieneSTL = !noTieneSTL && (
        contiene("tengo archivo stl") || contiene("tengo stl") ||
        contiene("cuento con archivo stl") || contiene("cuento con stl") ||
        contiene("adjunto stl") || contiene("aqui esta el stl")
    );

    const imagen =
        contiene("[imagen]") || contiene("imagen") || contiene("foto") || contiene("fotografia")
            ? "Sí" : "No";

    return {
        producto: extraerProducto(mensajesUsuario),
        color: extraerColores(mensajesUsuario),
        material: "PLA",
        cantidad,
        medidas: extraerMedidas(mensajesUsuario),
        imagen,
        stl: tieneSTL ? "Sí" : "No"
    };
}

module.exports = { extraerCotizacion };
