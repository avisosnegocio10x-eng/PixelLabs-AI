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

const receiveMessage = async (req, res) => {

    try {

        if (

    req.body.object !== "page" &&
    req.body.object !== "instagram" &&
    req.body.object !== "whatsapp_business_account"

) {

    return res.sendStatus(404);

}

        for (const entry of (req.body.entry || [])) {

            const eventos =

                entry.messaging ||

                entry.changes ||

                [];

            for (const event of eventos) {

                let data = null;
                                // ===============================
                // MESSENGER
                // ===============================

                if (entry.messaging) {

                    data =

                        parseMessengerEvent(
                            event
                        );

                }

                // ===============================
                // INSTAGRAM
                // ===============================

                else if (entry.changes) {

    if (
        event.value &&
        Array.isArray(event.value.messages)
    ) {

        data =
            parseWhatsAppEvent(event);

    } else {

        data =
            parseInstagramEvent(event);

    }

}

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

        return res.sendStatus(200);

    } catch (error) {

        console.error("");

        console.error("===================================");

        console.error("ERROR EN WEBHOOK V2");

        console.error("===================================");

        console.error(error);

        return res.sendStatus(500);

    }

};

module.exports = {

    verifyWebhook,

    receiveMessage

};