function extraerCotizacion(conversation) {

    const texto = conversation
        .filter(msg => msg.role === "user")
        .map(msg => msg.message)
        .join(" ")
        .toLowerCase();

    const cantidad =
        texto.match(/\b(\d+)\s*(unidad|unidades|llavero|llaveros|pieza|piezas)/i);

    const medidas =
        texto.match(/(\d+)\s*cm.*?(\d+)\s*cm/i);

    const colores = [];

    if (texto.includes("negro")) colores.push("Negro");
    if (texto.includes("blanco")) colores.push("Blanco");
    if (texto.includes("gris oscuro")) colores.push("Gris oscuro");
    if (texto.includes("gris")) colores.push("Gris");
    if (texto.includes("rosa")) colores.push("Rosa");
    if (texto.includes("turquesa")) colores.push("Turquesa");
    if (texto.includes("verde")) colores.push("Verde");
    if (texto.includes("verde bambú")) colores.push("Verde bambú");
    if (texto.includes("café")) colores.push("Café");

    let producto = "No especificado";

    if (texto.includes("llavero")) {

        producto = "Llavero";

    } else if (

        texto.includes("carro") ||
        texto.includes("auto") ||
        texto.includes("automóvil") ||
        texto.includes("lamborghini") ||
        texto.includes("ferrari") ||
        texto.includes("bmw") ||
        texto.includes("honda") ||
        texto.includes("toyota") ||
        texto.includes("modelo")

    ) {

        producto = "Modelo de vehículo";

    } else if (texto.includes("figura")) {

        producto = "Figura";

    } else if (texto.includes("maceta")) {

        producto = "Maceta";

    } else if (texto.includes("organizador")) {

        producto = "Organizador";

    }

    const tieneImagen =
        texto.includes("imagen") ||
        texto.includes("foto");

    const tieneSTL =

        (texto.includes("tengo stl") ||
        texto.includes("cuento con stl") ||
        texto.includes("archivo stl"))

        &&

        !texto.includes("no tengo stl");

    return {

        producto,

        color:
            colores.length
                ? colores.join(", ")
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
            tieneImagen
                ? "Sí"
                : "No",

        stl:
            tieneSTL
                ? "Sí"
                : "No"

    };

}

module.exports = {
    extraerCotizacion
};