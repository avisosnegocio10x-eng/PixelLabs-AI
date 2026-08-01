// ================================
// PIXELLABS - QUOTE EXTRACTOR V3
// ================================

function extraerCotizacion(conversation) {

    // ======================================
    // SOLO MENSAJES DEL CLIENTE
    // ======================================

    const mensajesUsuario = conversation.filter(

        msg => msg.role === "user"

    );

    const texto = mensajesUsuario
        .map(msg => msg.message)
        .join(" ")
        .toLowerCase();

    // ======================================
    // COLORES DISPONIBLES
    // ======================================

    const coloresDisponibles = [

        "negro",
        "blanco",

        "gris",
        "gris oscuro",
        "gris claro",

        "rosa",
        "fucsia",

        "turquesa",

        "verde",
        "verde brillante",
        "verde bambú",
        "verde militar",
        "verde oliva",

        "rojo",

        "azul",
        "azul marino",
        "azul cielo",
        "celeste",

        "amarillo",

        "naranja",

        "morado",
        "violeta",

        "café",
        "marrón",

        "beige",
        "crema",

        "dorado",
        "oro",

        "plateado",
        "plata",

        "cobre",
        "bronce",

        "transparente"

    ];

    // ======================================
    // ÚLTIMO COLOR CONFIRMADO
    // ======================================

    let ultimoColor = null;

    mensajesUsuario.forEach(msg => {

        const mensaje = msg.message.toLowerCase();

        coloresDisponibles.forEach(color => {

            if (mensaje.includes(color)) {

                ultimoColor =

                    color.charAt(0).toUpperCase() +

                    color.slice(1);

            }

        });

    });

    // ======================================
    // MATERIALES
    // ======================================

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
        // ======================================
    // STL
    // ======================================

    let stl = "No";

    // Primero buscamos frases negativas

    if (

        texto.includes("no tengo archivo stl") ||
        texto.includes("no tengo stl") ||
        texto.includes("no cuento con archivo stl") ||
        texto.includes("no cuento con stl") ||
        texto.includes("sin archivo stl") ||
        texto.includes("sin stl") ||
        texto.includes("únicamente tengo una imagen") ||
        texto.includes("unicamente tengo una imagen") ||
        texto.includes("solo tengo una imagen") ||
        texto.includes("solo cuento con una imagen")

    ) {

        stl = "No";

    }

    // Solo si NO encontramos una frase negativa,
    // buscamos si sí tiene STL.

    else if (

        texto.includes("tengo archivo stl") ||
        texto.includes("tengo stl") ||
        texto.includes("cuento con archivo stl") ||
        texto.includes("cuento con stl")

    ) {

        stl = "Sí";

    }

    // ======================================
    // IMAGEN
    // ======================================

    const imagen =

        texto.includes("imagen") ||
        texto.includes("foto") ||
        texto.includes("fotografía") ||
        texto.includes("fotografia")

            ? "Sí"

            : "No";

    // ======================================
    // CANTIDAD
    // ======================================

    let cantidad = "No especificada";

    const numeroCantidad = texto.match(

        /\b(\d+)\s*(unidad|unidades|pieza|piezas|figura|figuras|llavero|llaveros)/i

    );

    if (numeroCantidad) {

        cantidad = numeroCantidad[1];

    }

    else if (

        texto.includes("una unidad") ||
        texto.includes("un llavero") ||
        texto.includes("una figura") ||
        texto.includes("una pieza") ||
        texto.includes("solo una") ||
        texto.includes("solamente una") ||
        texto.includes("solo necesito una") ||
        texto.includes("únicamente una")

    ) {

        cantidad = "1";

    }

    // ======================================
    // MEDIDAS
    // ======================================

    let medidas = "No especificadas";

    const medidasMatch = texto.match(

        /(\d+)\s*cm.*?(\d+)\s*cm/i

    );

    if (medidasMatch) {

        medidas =

            `${medidasMatch[1]} cm x ${medidasMatch[2]} cm`;

    }
        // ======================================
    // RESULTADO
    // ======================================

    return {

        producto,

        color:

            ultimoColor ||

            "No especificado",

        material,

        cantidad,

        medidas,

        imagen,

        stl

    };

}

// ======================================
// EXPORTAR
// ======================================

module.exports = {

    extraerCotizacion

};