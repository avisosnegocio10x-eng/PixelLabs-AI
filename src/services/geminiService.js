const axios = require("axios");

const askGemini = async (message, systemPrompt = "") => {

    try {

        console.log("================================");
        console.log("API KEY (inicio):", process.env.GEMINI_API_KEY.substring(0, 10));
        console.log("API KEY (final):", process.env.GEMINI_API_KEY.slice(-6));
        console.log("================================");

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
- Responde siempre en español.
- No inventes precios.
- Si falta información, haz preguntas al cliente.
- Mantén las respuestas cortas.`
                            }
                        ]
                    }
                ]
            }

        );

        console.log("Gemini respondió correctamente.");

        return response.data.candidates[0].content.parts[0].text;

    } catch (error) {

        console.error("=========== ERROR GEMINI ===========");

        if (error.response) {

            console.error("Status:", error.response.status);
            console.error("Data:");
            console.error(JSON.stringify(error.response.data, null, 2));

        } else {

            console.error(error.message);

        }

        console.error("===================================");

        return "Lo siento, en este momento no puedo responder. Inténtalo nuevamente en unos minutos.";

    }

};

module.exports = {
    askGemini
};