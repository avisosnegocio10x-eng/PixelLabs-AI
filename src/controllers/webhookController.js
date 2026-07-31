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