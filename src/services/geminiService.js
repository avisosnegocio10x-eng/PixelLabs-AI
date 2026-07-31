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

Usuario:
${message}`
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

        return "Lo siento, ocurrió un problema al generar la respuesta.";

    }
};

module.exports = {
    askGemini
};