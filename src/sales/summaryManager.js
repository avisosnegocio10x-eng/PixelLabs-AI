const { extraerDatos } = require("../services/extractService");

async function generarResumen(conversation) {

    const datos = await extraerDatos(conversation);

    if (!datos) {

        return `
======================================
NUEVA SOLICITUD - PIXELLABS
======================================

No fue posible extraer automáticamente la información.
`;

    }

    return `
======================================
NUEVA SOLICITUD - PIXELLABS
======================================

Producto:
${datos.producto || "No especificado"}

Cantidad:
${datos.cantidad || "No especificada"}

Colores:
${datos.colores.length ? datos.colores.join(", ") : "No especificados"}

Medidas:
${datos.medidas || "No especificadas"}

Imagen:
${datos.imagen ? "Sí" : "No"}

Archivo STL:
${datos.stl ? "Sí" : "No"}

Estado:

Listo para cotización.
`;

}

module.exports = {

    generarResumen

};