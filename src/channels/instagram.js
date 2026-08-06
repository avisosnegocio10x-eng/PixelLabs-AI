function parseInstagramEvent(event) {

    if (
        !event.value ||
        !event.value.sender ||
        !event.value.message
    ) {

        return null;

    }

    return {

        plataforma: "instagram",

        senderId:
            event.value.sender.id,

        userMessage:
            event.value.message.text || "",

        externalMessageId:
            event.value.message.mid || null

    };

}

module.exports = {

    parseInstagramEvent

};
