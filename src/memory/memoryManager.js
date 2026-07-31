const conversations = {};

function crearConversacionSiNoExiste(userId) {

    if (!conversations[userId]) {

        conversations[userId] = {

            id: userId,

            nombre: null,

            plataforma: "Facebook",

            iaActiva: true,

            correoEnviado: false,

            esperandoNombre: false,

            messages: []

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

function getClient(userId) {

    crearConversacionSiNoExiste(userId);

    return conversations[userId];

}

function setClientName(userId, nombre) {

    crearConversacionSiNoExiste(userId);

    conversations[userId].nombre = nombre;

}

function estaEsperandoNombre(userId) {

    crearConversacionSiNoExiste(userId);

    return conversations[userId].esperandoNombre;

}

function setEsperandoNombre(userId, estado) {

    crearConversacionSiNoExiste(userId);

    conversations[userId].esperandoNombre = estado;

}

function correoYaEnviado(userId) {

    crearConversacionSiNoExiste(userId);

    return conversations[userId].correoEnviado;

}

function marcarCorreoEnviado(userId) {

    crearConversacionSiNoExiste(userId);

    conversations[userId].correoEnviado = true;

}

function getAllConversations() {

    return conversations;

}

module.exports = {

    addMessage,

    getConversation,

    getClient,

    setClientName,

    estaEsperandoNombre,

    setEsperandoNombre,

    getAllConversations,

    correoYaEnviado,

    marcarCorreoEnviado

};