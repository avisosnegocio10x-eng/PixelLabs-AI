const axios = require("axios");

const sendMessage = async (recipientId, message) => {
    try {

        await axios.post(

            "https://graph.facebook.com/v23.0/me/messages",

            {
                recipient: {
                    id: recipientId
                },

                message: {
                    text: message
                }

            },

            {
                headers: {
                    Authorization: `Bearer ${process.env.PAGE_ACCESS_TOKEN}`,
                    "Content-Type": "application/json"
                }
            }

        );

    } catch (error) {

        console.error("Error enviando mensaje:");

        console.error(
            error.response?.data || error.message
        );

    }
};

module.exports = {
    sendMessage
};