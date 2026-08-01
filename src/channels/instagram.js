function parseInstagramEvent(event) {

    if (
        !event.value ||
        !Array.isArray(event.value.messages)
    ) {

        return null;

    }

    return {

        plataforma: "instagram",

        senderId:
            event.value.contacts?.[0]?.wa_id ||
            event.value.messages?.[0]?.from,

        userMessage:
            event.value.messages?.[0]?.text?.body || ""

    };

}

module.exports = {

    parseInstagramEvent

};