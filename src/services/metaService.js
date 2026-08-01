const axios = require("axios");

const sendMessage = async (
    plataforma,
    recipientId,
    message
) => {

    try {

        // ======================================
        // MESSENGER / INSTAGRAM
        // ======================================

        if (
            plataforma === "messenger" ||
            plataforma === "instagram"
        ) {

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

                        Authorization:
                            `Bearer ${process.env.PAGE_ACCESS_TOKEN}`,

                        "Content-Type":
                            "application/json"

                    }

                }

            );

            return;

        }

        // ======================================
        // WHATSAPP
        // ======================================

        if (
            plataforma === "whatsapp"
        ) {

            await axios.post(

                `https://graph.facebook.com/v23.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,

                {

                    messaging_product:
                        "whatsapp",

                    to: recipientId,

                    type: "text",

                    text: {

                        body: message

                    }

                },

                {

                    headers: {

                        Authorization:
                            `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,

                        "Content-Type":
                            "application/json"

                    }

                }

            );

        }

    } catch (error) {

        console.error("");

        console.error("===================================");

        console.error("ERROR ENVIANDO MENSAJE");

        console.error("===================================");

        console.error(

            error.response?.data ||

            error.message

        );

    }

};

module.exports = {

    sendMessage

};