const axios = require("axios");

const {
    obtenerEstadoConversacion,
    obtenerCamposFaltantes
} = require("../sales/salesManager");

const askGemini = async (conversation, systemPrompt = "") => {

    try {

        let history = "";

        conversation.forEach(msg => {

            if (msg.role === "user") {

                history += `Cliente: ${msg.message}\n`;

            } else {

                history += `PixelLabs: ${msg.message}\n`;

            }

        });

        const estado = obtenerEstadoConversacion(conversation);

        const faltantes = obtenerCamposFaltantes(estado);

        const response = await axios.post(

            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,

            {
                contents: [
                    {
                        role: "user",
                        parts: [
                            {
                                text: `${systemPrompt}

HISTORIAL

${history}

ESTADO ACTUAL

${JSON.stringify(estado, null, 2)}

DATOS FALTANTES

${faltantes.join(", ") || "Ninguno"}

INSTRUCCIONES

- Continúa la conversación sin volver a saludar.
- Pregunta únicamente por los datos faltantes.
- No vuelvas a preguntar datos que ya fueron proporcionados.
- Cuando todos los datos estén completos, indícalo y menciona que un asesor continuará con la cotización.
- Responde siempre como un empleado de PixelLabs.
- Nunca inventes información.
- No uses markdown (*, ** o #).
- Responde en español.
- Sé breve y natural.`
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

        return "Lo siento, en este momento no puedo responder.";

    }

};

module.exports = {
    askGemini
};