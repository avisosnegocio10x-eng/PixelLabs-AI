const fs = require("fs");
const path = require("path");

const FILE_PATH = path.join(__dirname, "conversations.json");

// ======================================
// CARGAR CONVERSACIONES
// ======================================

function cargarConversaciones() {

    try {

        if (!fs.existsSync(FILE_PATH)) {

            fs.writeFileSync(FILE_PATH, "{}");

        }

        return JSON.parse(

            fs.readFileSync(FILE_PATH, "utf8")

        );

    } catch (error) {

        console.error("Error cargando conversaciones:", error);

        return {};

    }

}

// ======================================
// GUARDAR CONVERSACIONES
// ======================================

let conversations = cargarConversaciones();

function guardarConversaciones() {

    fs.writeFileSync(

        FILE_PATH,

        JSON.stringify(conversations, null, 4)

    );

}

// ======================================

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

        guardarConversaciones();

    }

}

// ======================================

function addMessage(userId, role, message) {

    crearConversacionSiNoExiste(userId);

    conversations[userId].messages.push({

        role,

        message,

        timestamp: Date.now()

    });

    guardarConversaciones();

}

// ======================================

function getConversation(userId) {

    crearConversacionSiNoExiste(userId);

    return conversations[userId].messages;

}

// ======================================

function getClient(userId) {

    crearConversacionSiNoExiste(userId);

    return conversations[userId];

}

// ======================================

function setClientName(userId, nombre) {

    crearConversacionSiNoExiste(userId);

    conversations[userId].nombre = nombre;

    guardarConversaciones();

}

// ======================================

function estaEsperandoNombre(userId) {

    crearConversacionSiNoExiste(userId);

    return conversations[userId].esperandoNombre;

}

function setEsperandoNombre(userId, estado) {

    crearConversacionSiNoExiste(userId);

    conversations[userId].esperandoNombre = estado;

    guardarConversaciones();

}

// ======================================

function correoYaEnviado(userId) {

    crearConversacionSiNoExiste(userId);

    return conversations[userId].correoEnviado;

}

function marcarCorreoEnviado(userId) {

    crearConversacionSiNoExiste(userId);

    conversations[userId].correoEnviado = true;

    guardarConversaciones();

}

// ======================================

function getAllConversations() {

    conversations = cargarConversaciones();

    return conversations;

}

// ======================================

module.exports = {

    addMessage,

    getConversation,

    getClient,

    setClientName,

    estaEsperandoNombre,

    setEsperandoNombre,

    getAllConversations,

    correoYaEnviado,

    marcarCorreoEnviado,

    guardarConversaciones

};