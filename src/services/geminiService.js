const axios = require("axios");

const askGemini = async (message, systemPrompt = "") => {

    try {

        const response = await axios.post(

            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,

            {
                contents: [
                    {
                        role: "user",
                        parts: [
                            {
                                text: `${systemPrompt}

MENSAJE DEL CLIENTE:

${message}

INSTRUCCIONES IMPORTANTES:

- Responde únicamente como un empleado de PixelLabs.
- Nunca digas que eres Gemini.
- Nunca digas que eres una IA.
- Sé amable y profesional.
- Responde de forma clara.
- Responde en español.
- No inventes precios.
- Si falta información, haz preguntas al cliente.
- Mantén las respuestas cortas (menos de 150 palabras).`
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

        return "Lo siento, en este momento no puedo responder. Inténtalo nuevamente en unos minutos.";

    }

};

module.exports = {
    askGemini
};