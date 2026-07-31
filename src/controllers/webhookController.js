const { sendMessage } = require("../services/metaService");
const { askGemini } = require("../services/geminiService");
const systemPrompt = require("../prompts/systemPrompt");

const {
    addMessage,
    getConversation
} = require("../memory/memoryManager");

const verifyWebhook = (req, res) => {

    const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (
        mode &&
        token &&
        mode === "subscribe" &&
        token === VERIFY_TOKEN
    ) {

        console.log("✅ Webhook verificado correctamente.");
        return res.status(200).send(challenge);

    }

    console.log("❌ Error al verificar el webhook.");

    return res.sendStatus(403);

};

const receiveMessage = async (req, res) => {

    try {

        if (req.body.object === "page") {

            for (const entry of req.body.entry) {

                for (const event of entry.messaging) {

                    if (event.message && event.sender) {

                        const senderId = event.sender.id;

                        const userMessage = event.message.text || "";

                        console.log("Cliente:", userMessage);

                        // Guardar mensaje del cliente
                        addMessage(
                            senderId,
                            "user",
                            userMessage
                        );

                        // Obtener historial completo
                        const conversation =
                            getConversation(senderId);

                        // Preguntar a Gemini usando el historial
                        const aiResponse =
                            await askGemini(
                                conversation,
                                systemPrompt
                            );

                        // Guardar respuesta del bot
                        addMessage(
                            senderId,
                            "assistant",
                            aiResponse
                        );

                        // Enviar respuesta
                        await sendMessage(
                            senderId,
                            aiResponse
                        );

                    }

                }

            }

        }

        res.sendStatus(200);

    } catch (error) {

        console.error(error);

        res.sendStatus(500);

    }

};

module.exports = {
    verifyWebhook,
    receiveMessage
};