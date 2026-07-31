const { extraerCotizacion } = require("../sales/quoteExtractor");

function generarContexto(conversation) {

    const datos = extraerCotizacion(conversation);

    const ultimosMensajes = conversation.slice(-6);

    let historial = "";

    ultimosMensajes.forEach(msg => {

        historial += `${msg.role === "user" ? "Cliente" : "PixelLabs"}: ${msg.message}\n`;

    });

    return `

DATOS DEL CLIENTE

Producto: ${datos.producto}

Color: ${datos.color}

Cantidad: ${datos.cantidad}

Medidas: ${datos.medidas}

Imagen: ${datos.imagen}

Archivo STL: ${datos.stl}

----------------------------------

ÚLTIMOS MENSAJES

${historial}

`;

}

module.exports = {

    generarContexto

};