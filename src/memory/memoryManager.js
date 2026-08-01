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

        const data = fs.readFileSync(FILE_PATH, "utf8");

        return JSON.parse(data);

    } catch (error) {

        console.error("Error cargando conversaciones:", error);

        return {};

    }

}

// ======================================
// GUARDAR CONVERSACIONES
// ======================================

function guardarConversaciones(conversations) {

    fs.writeFileSync(

        FILE_PATH,

        JSON.stringify(conversations, null, 4)

    );

}

let conversations = cargarConversaciones();

console.log("");
console.log("====================================");
console.log("MEMORY MANAGER CARGADO");
console.log("====================================");

// ======================================
// CREAR CLIENTE SI NO EXISTE
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

        guardarConversaciones(conversations);

    }

}

// ======================================
// AGREGAR MENSAJE
// ======================================

function addMessage(userId, role, message) {

    console.log("");
    console.log("====================================");
    console.log("ADD MESSAGE EJECUTADO");
    console.log("Usuario:", userId);
    console.log("Rol:", role);
    console.log("Mensaje:", message);
    console.log("====================================");

    crearConversacionSiNoExiste(userId);

    conversations[userId].messages.push({

        role,

        message,

        timestamp: Date.now()

    });

    guardarConversaciones(conversations);

    console.log("Conversación guardada correctamente.");

}

// ======================================
// OBTENER CONVERSACIÓN
// ======================================

function getConversation(userId) {

    crearConversacionSiNoExiste(userId);

    return conversations[userId].messages;

}

// ======================================
// OBTENER CLIENTE
// ======================================

function getClient(userId) {

    crearConversacionSiNoExiste(userId);

    return conversations[userId];

}

// ======================================
// GUARDAR NOMBRE
// ======================================

function setClientName(userId, nombre) {

    crearConversacionSiNoExiste(userId);

    conversations[userId].nombre = nombre;

    guardarConversaciones(conversations);

}

// ======================================
// ESPERANDO NOMBRE
// ======================================

function estaEsperandoNombre(userId) {

    crearConversacionSiNoExiste(userId);

    return conversations[userId].esperandoNombre;

}

function setEsperandoNombre(userId, estado) {

    crearConversacionSiNoExiste(userId);

    conversations[userId].esperandoNombre = estado;

    guardarConversaciones(conversations);

}

// ======================================
// CORREO ENVIADO
// ======================================

function correoYaEnviado(userId) {

    crearConversacionSiNoExiste(userId);

    return conversations[userId].correoEnviado;

}

function marcarCorreoEnviado(userId) {

    crearConversacionSiNoExiste(userId);

    conversations[userId].correoEnviado = true;

    guardarConversaciones(conversations);

}

// ======================================
// TODAS LAS CONVERSACIONES
// ======================================

function getAllConversations() {

    conversations = cargarConversaciones();

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