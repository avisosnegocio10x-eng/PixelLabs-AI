// ================================
// PIXELLABS - QUOTE EXTRACTOR V2
// ================================

function extraerCotizacion(conversation) {

    const texto = conversation
        .filter(msg => msg.role === "user")
        .map(msg => msg.message)
        .join(" ")
        .toLowerCase();

    // ================================
    // COLORES
    // ================================

    const coloresDisponibles = [
        "negro","blanco","gris","gris oscuro","gris claro",
        "rosa","fucsia","turquesa",
        "verde","verde brillante","verde bambú","verde militar","verde oliva",
        "rojo","azul","azul marino","azul cielo","celeste",
        "amarillo","naranja","morado","violeta",
        "café","marrón","beige","crema",
        "dorado","oro","plateado","plata",
        "cobre","bronce","transparente"
    ];

    const coloresDetectados = [];

    coloresDisponibles.forEach(color => {

        if (texto.includes(color)) {

            if (!coloresDetectados.includes(color)) {

                coloresDetectados.push(
                    color.charAt(0).toUpperCase() +
                    color.slice(1)
                );

            }

        }

    });

    // ================================
    // MATERIALES
    // ================================

    const materiales = [
        "pla silk",
        "pla matte",
        "pla",
        "petg",
        "abs",
        "asa",
        "tpu",
        "resina",
        "carbon fiber",
        "wood"
    ];

    let material = "No especificado";

    materiales.forEach(item => {

        if (texto.includes(item)) {

            material = item.toUpperCase();

        }

    });

    // ================================
    // PRODUCTOS
    // ================================

    const productos = [
        "llavero",
        "figura",
        "maceta",
        "organizador",
        "soporte",
        "porta celular",
        "logo",
        "letras",
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
        "engranaje",
        "decoración"
    ];

    let producto = "No especificado";

    productos.forEach(item => {

        if (texto.includes(item)) {

            producto =
                item.charAt(0).toUpperCase() +
                item.slice(1);

        }

    });

    // ================================
    // STL
    // ================================

    let stl = "No";

    if (

        texto.includes("no tengo stl") ||
        texto.includes("sin stl") ||
        texto.includes("no cuento con stl") ||
        texto.includes("solo tengo una imagen") ||
        texto.includes("únicamente tengo una imagen")

    ) {

        stl = "No";

    } else if (

        texto.includes("archivo stl") ||
        texto.includes("tengo stl") ||
        texto.includes("cuento con stl")

    ) {

        stl = "Sí";

    }

    // ================================
    // IMAGEN
    // ================================

    const imagen =

        texto.includes("imagen") ||
        texto.includes("foto")

            ? "Sí"

            : "No";

    // ================================
    // CANTIDAD
    // ================================

    const cantidadMatch =
        texto.match(/\b(\d+)\s*(unidad|unidades|pieza|piezas|llavero|llaveros)/i);

    const cantidad =

        cantidadMatch

            ? cantidadMatch[1]

            : "No especificada";

    // ================================
    // MEDIDAS
    // ================================

    const medidasMatch =
        texto.match(/(\d+)\s*cm.*?(\d+)\s*cm/i);

    const medidas =
        medidasMatch
            ? `${medidasMatch[1]} cm x ${medidasMatch[2]} cm`
            : "No especificadas";

    return {

        producto,

        color:
            coloresDetectados.length
                ? coloresDetectados.join(", ")
                : "No especificado",

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