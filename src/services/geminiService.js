const axios = require("axios");

const askGemini = async (message, systemPrompt = "") => {

    try {

        const response = await axios.post(

            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,

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
- No menciones que eres Gemini.
- No menciones que eres una IA.
- Sé amable.
- Sé breve.
- No uses listas enormes.
- Responde en menos de 150 palabras.
- Si falta información, haz preguntas al cliente.`
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