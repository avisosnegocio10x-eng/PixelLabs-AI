function extraerCotizacion(conversation) {

    const texto = conversation
        .map(msg => msg.message)
        .join(" ")
        .toLowerCase();

    const cantidad =
        texto.match(/\b(\d+)\s*(unidad|unidades|llavero|llaveros|pieza|piezas)/i);

    const medidas =
        texto.match(/(\d+)\s*cm.*?(\d+)\s*cm/i);

    return {

        producto:
            texto.includes("llavero")
                ? "Llavero"
                : texto.includes("figura")
                ? "Figura"
                : "No especificado",

        color:
            texto.includes("negro")
                ? "Negro"
                : texto.includes("blanco")
                ? "Blanco"
                : texto.includes("gris oscuro")
                ? "Gris oscuro"
                : texto.includes("gris")
                ? "Gris"
                : texto.includes("rosa")
                ? "Rosa"
                : texto.includes("turquesa")
                ? "Turquesa"
                : texto.includes("verde brillante")
                ? "Verde brillante"
                : texto.includes("verde bambú")
                ? "Verde bambú"
                : texto.includes("café")
                ? "Café"
                : "No especificado",

        cantidad:
            cantidad
                ? cantidad[1]
                : "No especificada",

        medidas:
            medidas
                ? `${medidas[1]} cm x ${medidas[2]} cm`
                : "No especificadas",

        imagen:
            texto.includes("imagen")
                ? "Sí"
                : "No",

        stl:
            texto.includes("stl")
                ? "Sí"
                : "No"

    };

}

module.exports = {
    extraerCotizacion
};