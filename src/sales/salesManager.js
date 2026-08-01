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
        .map(m => m.message.toLowerCase())
        .join(" ");

    // PRODUCTO
    if (
        texto.includes("llavero") ||
        texto.includes("figura") ||
        texto.includes("maceta") ||
        texto.includes("organizador") ||
        texto.includes("carro") ||
        texto.includes("auto") ||
        texto.includes("automóvil") ||
        texto.includes("lamborghini") ||
        texto.includes("ferrari") ||
        texto.includes("bmw") ||
        texto.includes("toyota") ||
        texto.includes("honda") ||
        texto.includes("modelo")
    ) {

        estado.producto = true;

    }

    // STL

if (

    texto.includes("tengo stl") ||
    texto.includes("cuento con stl") ||
    texto.includes("tengo archivo stl") ||
    texto.includes("cuento con archivo stl") ||
    texto.includes("archivo stl")

) {

    estado.archivo = true;

}

// También es una respuesta válida NO tener STL

if (

    texto.includes("no tengo stl") ||
    texto.includes("no tengo archivo stl") ||
    texto.includes("no cuento con stl") ||
    texto.includes("no cuento con archivo stl") ||
    texto.includes("sin stl") ||
    texto.includes("sin archivo stl") ||
    texto.includes("solo tengo una imagen") ||
    texto.includes("únicamente tengo una imagen") ||
    texto.includes("unicamente tengo una imagen") ||
    texto.includes("solo cuento con una imagen")

) {

    estado.archivo = true;

}

    // IMAGEN

    if (
        texto.includes("imagen") ||
        texto.includes("foto")
    ) {

        estado.imagen = true;

    }

    // COLOR

    const colores = [
        "negro",
        "blanco",
        "gris",
        "gris oscuro",
        "rosa",
        "turquesa",
        "verde",
        "verde bambú",
        "café"
    ];

    estado.color =
        colores.some(color => texto.includes(color));

    // CANTIDAD

    estado.cantidad =
        /\b\d+\b/.test(texto) ||
        texto.includes("una unidad") ||
        texto.includes("un llavero");

    // TAMAÑO

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