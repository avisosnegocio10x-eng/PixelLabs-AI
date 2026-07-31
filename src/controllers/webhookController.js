const { sendMessage } = require("../services/metaService");
const { askGemini } = require("../services/geminiService");
const systemPrompt = require("../utils/systemPrompt");

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

        console.log("📩 Nuevo mensaje recibido:");
        console.log(JSON.stringify(req.body, null, 2));

        if (req.body.object === "page") {

            for (const entry of req.body.entry) {

                for (const event of entry.messaging) {

                    if (event.message && event.sender) {

                        const senderId = event.sender.id;

                        const userMessage = event.message.text || "";

                        console.log("Cliente:", userMessage);

                        const aiResponse = await askGemini(
                            userMessage,
                            systemPrompt
                        );

                        console.log("Gemini:", aiResponse);

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