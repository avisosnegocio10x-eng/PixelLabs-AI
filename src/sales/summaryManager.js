function generarResumen(conversation) {

    const texto = conversation
        .map(msg => msg.message)
        .join(" ");

    let producto = "No especificado";

    if (texto.toLowerCase().includes("llavero")) {

        producto = "Llavero";

    } else if (texto.toLowerCase().includes("figura")) {

        producto = "Figura";

    } else if (texto.toLowerCase().includes("maceta")) {

        producto = "Maceta";

    }

    return `

=========================
NUEVO CLIENTE PIXELLABS
=========================

Producto:
${producto}

Resumen de conversación:

${texto}

Estado:

Listo para cotización.

`;

}

module.exports = {
    generarResumen
};