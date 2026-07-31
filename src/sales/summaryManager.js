const {
    extraerCotizacion
} = require("./quoteExtractor");

function generarResumen(conversation) {

    const datos = extraerCotizacion(conversation);

    return `

======================================
NUEVA SOLICITUD - PIXELLABS
======================================

Producto:
${datos.producto}

Color:
${datos.color}

Cantidad:
${datos.cantidad}

Medidas:
${datos.medidas}

Diseño desde imagen:
${datos.imagen}

Archivo STL:
${datos.stl}

Estado:
Listo para cotización.

`;

}

module.exports = {
    generarResumen
};