const axios = require("axios");

const extraerDatos = async (conversation) => {

    try {

        const historial = conversation
            .map(msg => `${msg.role}: ${msg.message}`)
            .join("\n");

        const response = await axios.post(

            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,

            {

                contents: [

                    {

                        role: "user",

                        parts: [

                            {

                                text: `

Analiza la siguiente conversación entre un cliente y PixelLabs.

Extrae únicamente la información del CLIENTE.

Si PixelLabs menciona colores, STL o medidas como ejemplo, NO los tomes como datos del cliente.

Responde únicamente un JSON válido.

Formato:

{
  "producto": null,
  "cantidad": null,
  "colores": [],
  "medidas": null,
  "imagen": false,
  "stl": false
}

Conversación:

${historial}

`

                            }

                        ]

                    }

                ]

            }

        );

        let texto =
            response.data.candidates[0].content.parts[0].text;

        texto = texto
            .replace(/```json/g, "")
            .replace(/```/g, "")
            .trim();

        return JSON.parse(texto);

    } catch (error) {

        console.error("Error en extractService:");

        console.error(error.response?.data || error.message);

        return null;

    }

};

module.exports = {

    extraerDatos

};