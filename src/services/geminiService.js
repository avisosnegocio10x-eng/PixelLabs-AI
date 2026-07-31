const axios = require("axios");

const askGemini = async (message, systemPrompt = "") => {

    try {

        const response = await axios.post(

            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,

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
- Habla siempre en español.
- Sé amable y profesional.
- No inventes precios.
- Si falta información, pregunta al cliente.`
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