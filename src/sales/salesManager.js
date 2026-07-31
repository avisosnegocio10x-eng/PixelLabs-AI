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
        .map(m => m.message.toLowerCase())
        .join(" ");

    // Producto

    if (
        texto.includes("llavero") ||
        texto.includes("figura") ||
        texto.includes("maceta") ||
        texto.includes("organizador")
    ) {

        estado.producto = true;

    }

    // Archivo STL

    if (
        texto.includes("stl")
    ) {

        estado.archivo = true;

    }

    // Imagen

    if (
        texto.includes("imagen") ||
        texto.includes("foto")
    ) {

        estado.imagen = true;

    }

    // Colores

    const colores = [

        "negro",

        "blanco",

        "gris",

        "gris oscuro",

        "rosa",

        "turquesa",

        "verde",

        "café"

    ];

    estado.color = colores.some(c => texto.includes(c));

    // Cantidad

    estado.cantidad = /\b\d+\b/.test(texto);

    // Tamaño

    estado.tamaño =
        texto.includes("cm");

    return estado;

}

function obtenerCamposFaltantes(estado) {

    return campos.filter(

        campo => !estado[campo]

    );

}

module.exports = {

    obtenerEstadoConversacion,

    obtenerCamposFaltantes

};