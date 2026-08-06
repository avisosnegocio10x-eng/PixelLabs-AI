function parseMessengerEvent(event) {

    if (!event.message || !event.sender) {

        return null;

    }

    let userMessage = "";

    // ===============================
    // TEXTO
    // ===============================

    if (event.message.text) {

        userMessage = event.message.text;

    }

    // ===============================
    // ARCHIVOS
    // ===============================

    else if (

        event.message.attachments &&
        event.message.attachments.length > 0

    ) {

        const tipo =
            event.message.attachments[0].type;

        if (tipo === "image") {

            userMessage = "[IMAGEN]";

        }

        else {

            userMessage =
                `[${tipo.toUpperCase()}]`;

        }

    }

    return {

        plataforma: "messenger",

        senderId: event.sender.id,

        userMessage,

        externalMessageId: event.message.mid || null

    };

}

module.exports = {

    parseMessengerEvent

};
