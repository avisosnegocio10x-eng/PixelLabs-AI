const {
    processConversation
} = require("../handlers/conversationHandler");

const {
    parseMessengerEvent
} = require("../channels/messenger");

const {
    parseInstagramEvent
} = require("../channels/instagram");

const {
    parseWhatsAppEvent
} = require("../channels/whatsapp");

// ======================================
// VERIFICAR WEBHOOK
// ======================================

const verifyWebhook = (req, res) => {

    const VERIFY_TOKEN =
        process.env.VERIFY_TOKEN;

    const mode =
        req.query["hub.mode"];

    const token =
        req.query["hub.verify_token"];

    const challenge =
        req.query["hub.challenge"];

    if (

        mode &&
        token &&
        mode === "subscribe" &&
        token === VERIFY_TOKEN

    ) {

        console.log(
            "✅ Webhook verificado correctamente."
        );

        return res
            .status(200)
            .send(challenge);

    }

    console.log(
        "❌ Error al verificar el webhook."
    );

    return res.sendStatus(403);

};

// ======================================
// RECIBIR MENSAJES
// ======================================

const receiveMessage = async (req, res) => {

    try {

        const objeto =
            req.body.object;

        if (

            objeto !== "page" &&
            objeto !== "instagram" &&
            objeto !== "whatsapp_business_account"

        ) {

            return res.sendStatus(404);

        }

        for (const entry of (req.body.entry || [])) {

            // ======================================
            // MESSENGER
            // ======================================

            if (objeto === "page") {

                for (const event of (entry.messaging || [])) {

                    const data =
                        parseMessengerEvent(event);

                    if (!data) {

                        continue;

                    }

                    await processConversation(data);

                }

            }

            // ======================================
            // INSTAGRAM
            // ======================================

            if (objeto === "instagram") {

                for (const event of (entry.changes || [])) {

                    const data =
                        parseInstagramEvent(event);

                    if (!data) {

                        continue;

                    }

                    console.log("");

                    console.log("===================================");

                    console.log("NUEVO MENSAJE");

                    console.log("===================================");

                    console.log(data);

                    await processConversation(data);

                }

            }

            // ======================================
            // WHATSAPP
            // ======================================

            if (objeto === "whatsapp_business_account") {

                for (const event of (entry.changes || [])) {

                    const data =
                        parseWhatsAppEvent(event);

                    if (!data) {

                        continue;

                    }

                    console.log("");

                    console.log("===================================");

                    console.log("NUEVO MENSAJE");

                    console.log("===================================");

                    console.log(data);

                    await processConversation(data);

                }

            }

        }

        return res.sendStatus(200);

    } catch (error) {

        console.error("Webhook processing failed", {
            code: error.response?.data?.error?.code || error.code || "UNKNOWN",
            message: error.message || "Unknown error"
        });

        return res.sendStatus(500);

    }

};

module.exports = {

    verifyWebhook,

    receiveMessage

};
