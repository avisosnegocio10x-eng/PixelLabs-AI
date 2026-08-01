function parseMessengerEvent(event) {

    if (!event.message || !event.sender) {

        return null;

    }

    return {

        plataforma: "messenger",

        senderId: event.sender.id,

        userMessage: event.message.text || ""

    };

}

module.exports = {

    parseMessengerEvent

};