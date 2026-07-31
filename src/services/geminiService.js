const axios = require("axios");

const {
    generarContexto
} = require("../context/contextManager");

const askGemini = async (conversation, systemPrompt = "") => {

    try {

        const contexto = generarContexto(conversation);

        const response = await axios.post(

            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,

            {
                contents: [
                    {
                        role: "user",
                        parts: [
                            {
                                text: `${systemPrompt}

CONTEXTO DEL CLIENTE

${contexto}

INSTRUCCIONES

- Continúa la conversación naturalmente.
- No vuelvas a saludar si ya saludaste.
- Usa la información del contexto.
- No vuelvas a preguntar datos que ya existen.
- Si toda la información está completa, indica que un asesor continuará con la cotización.
- Nunca inventes información.
- Nunca inventes precios.
- Responde únicamente como un empleado de PixelLabs.
- Responde siempre en español.
- Sé breve y profesional.`
                            }
                        ]
                    }
                ]
            }

        );

        return response.data.candidates[0].content.parts[0].text;

    } catch (error) {

        console.error("Error con Gemini:");

        console.error(
            error.response?.data || error.message
        );

        return "En este momento estamos procesando varias solicitudes. Por favor, intenta nuevamente en unos segundos.";

    }

};

module.exports = {

    askGemini

};