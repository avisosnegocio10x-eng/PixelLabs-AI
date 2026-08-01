const { sendMessage } = require("../services/metaService");
const { askGemini } = require("../services/geminiService");

const {
    esNombreValido
} = require("../services/nameValidationService");

const systemPrompt = require("../prompts/systemPrompt");

const {
    addMessage,
    getConversation,
    correoYaEnviado,
    marcarCorreoEnviado,
    estaEsperandoNombre,
    setEsperandoNombre
} = require("../memory/memoryManager");

const {
    tieneNombre,
    guardarNombre
} = require("../customer/customerManager");

const {
    obtenerEstadoConversacion,
    obtenerCamposFaltantes
} = require("../sales/salesManager");

const {
    generarResumen
} = require("../sales/summaryManager");

const {
    sendEmail
} = require("../email/emailManager");

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

// ======================================
// VALIDAR SI ESTAMOS ESPERANDO EL NOMBRE
// ======================================
                        if (estaEsperandoNombre(senderId)) {

                            const nombreValido =
                                await esNombreValido(userMessage);

                          if (!nombreValido) {

    setEsperandoNombre(
        senderId,
        true
    );

    await sendMessage(
        senderId,
        "Gracias. Solo necesito el nombre de la persona o empresa con la que deseas registrar la cotización.\n\nPor ejemplo:\n• Carlos López\n• Empresa XYZ"
    );

    continue;

}
    guardarNombre(
    senderId,
    userMessage
);

addMessage(
    senderId,
    "user",
    userMessage
);
                            setEsperandoNombre(
                                senderId,
                                false
                            );

                            const conversation =
                                getConversation(senderId);

                            const resumen =
                                generarResumen(
                                    conversation,
                                    senderId
                                );

                            console.log("");

                            console.log("===================================");

                            console.log("CLIENTE REGISTRADO");

                            console.log("===================================");

                            console.log(resumen);

                            await sendEmail(
                                "Nuevo cliente - PixelLabs",
                                resumen
                            );

                            marcarCorreoEnviado(
                                senderId
                            );

console.log("📧 Correo enviado solo una vez.");

                            await sendMessage(
                                senderId,
                                `¡Muchas gracias, ${userMessage}!

Hemos registrado correctamente tu solicitud.

Un asesor de PixelLabs revisará tu proyecto y preparará tu cotización lo antes posible.`
                            );

                            continue;

                        }

                        addMessage(
                            senderId,
                            "user",
                            userMessage
                        );

                        const conversation =
                            getConversation(senderId);

                        const estado =
                            obtenerEstadoConversacion(
                                conversation
                            );
const faltantes =
    obtenerCamposFaltantes(
        estado
    );

const aiResponse =
    await askGemini(
        conversation,
        systemPrompt
    );

                        addMessage(
                            senderId,
                            "assistant",
                            aiResponse
                        );

                        await sendMessage(
                            senderId,
                            aiResponse
                        );

                        // ======================================
                        // LA COTIZACIÓN ESTÁ COMPLETA
                        // ======================================

                        if (
                            faltantes.length === 0 &&
                            !correoYaEnviado(senderId)
                        ) {

if (!tieneNombre(senderId)) {

    setEsperandoNombre(
        senderId,
        true
    );

    console.log("");

    console.log("===================================");

    console.log("ESPERANDO NOMBRE DEL CLIENTE");

    console.log("===================================");

    continue;

}

                            const resumen =
                                generarResumen(
                                    conversation,
                                    senderId
                                );

                            console.log("");

                            console.log("===================================");

                            console.log("CLIENTE LISTO PARA COTIZAR");

                            console.log("===================================");

                            console.log(resumen);

                            await sendEmail(
                                "Nuevo cliente - PixelLabs",
                                resumen
                            );

                            marcarCorreoEnviado(
                                senderId
                            );

                            console.log("📧 Correo enviado correctamente.");

                        }

                    }

                }

            }

        }

       res.sendStatus(200);

} catch (error) {

        console.error("");

        console.error("===================================");

        console.error("ERROR EN WEBHOOK");

        console.error("===================================");

        console.error(error);

        res.sendStatus(500);

    }

};

module.exports = {

    verifyWebhook,

    receiveMessage

};