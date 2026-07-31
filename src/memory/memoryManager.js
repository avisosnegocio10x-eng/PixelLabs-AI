const conversations = {};

function crearConversacionSiNoExiste(userId) {

    if (!conversations[userId]) {

        conversations[userId] = {

            messages: [],

            correoEnviado: false

        };

    }

}

function addMessage(userId, role, message) {

    crearConversacionSiNoExiste(userId);

    conversations[userId].messages.push({

        role,

        message,

        timestamp: Date.now()

    });

}

function getConversation(userId) {

    crearConversacionSiNoExiste(userId);

    return conversations[userId].messages;

}

function correoYaEnviado(userId) {

    crearConversacionSiNoExiste(userId);

    return conversations[userId].correoEnviado;

}

function marcarCorreoEnviado(userId) {

    crearConversacionSiNoExiste(userId);

    conversations[userId].correoEnviado = true;

}

module.exports = {

    addMessage,

    getConversation,

    correoYaEnviado,

    marcarCorreoEnviado

};