const axios = require("axios");

async function esNombreValido(texto) {

    try {

        const response = await axios.post(

            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,

            {
                contents: [
                    {
                        role: "user",
                        parts: [
                            {
                                text: `
Analiza el siguiente mensaje.

Mensaje:
"${texto}"

Tu única tarea es determinar si el mensaje corresponde al nombre con el que un cliente desea registrar una cotización.

Puede ser:

- Nombre de una persona.
- Nombre de una empresa.
- Nombre de un negocio.
- Nombre de una institución.

Ejemplos válidos:

Carlos López
Empresa XYZ
PixelLabs
Restaurante El Buen Sabor
Colegio San José

Ejemplos NO válidos:

Hola
Buenas tardes
Quiero cotizar
¿Cuánto cuesta?
Necesito una figura
Gracias

Responde únicamente con una palabra:

SI

o

NO
`
                            }
                        ]
                    }
                ]
            }

        );

        const respuesta = response.data.candidates[0].content.parts[0].text
            .trim()
            .toUpperCase();

        return respuesta === "SI";

    } catch (error) {

        console.error("Error validando nombre:");

        console.error(
            error.response?.data || error.message
        );

        return false;

    }

}

module.exports = {

    esNombreValido

};