const axios = require("axios");

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

        const response = await axios.post(

            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,

            {
                contents: [
                    {
                        role: "user",
                        parts: [
                            {
                                text: `${systemPrompt}

HISTORIAL DE LA CONVERSACIÓN

${history}

INSTRUCCIONES IMPORTANTES

- Continúa la conversación.
- No vuelvas a saludar si ya saludaste.
- Recuerda todo el contexto anterior.
- Habla como un empleado de PixelLabs.
- Nunca inventes precios.
- Nunca inventes servicios.
- Si falta información para una cotización, sigue haciendo preguntas.
- Responde siempre en español.`
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