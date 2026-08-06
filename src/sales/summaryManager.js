const { extraerCotizacion } = require("./quoteExtractor");

const {
    obtenerCliente
} = require("../customer/customerManager");

function generarResumen(conversation, userId) {

    const datos = extraerCotizacion(conversation);

    const cliente = obtenerCliente(userId);

    return `
=========================
NUEVO CLIENTE PIXELLABS
=========================

Cliente:
${cliente.nombre || "No registrado"}

ID:
${cliente.id}

Plataforma:
${cliente.plataforma}

--------------------------------

Producto:
${datos.producto}

Color:
${datos.color}

Material:
${datos.material}

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
