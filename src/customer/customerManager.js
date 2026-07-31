const {

    getClient,

    setClientName

} = require("../memory/memoryManager");

// ======================================
// OBTENER CLIENTE
// ======================================

function obtenerCliente(userId) {

    return getClient(userId);

}

// ======================================
// TIENE NOMBRE
// ======================================

function tieneNombre(userId) {

    const cliente = getClient(userId);

    return cliente.nombre !== null;

}

// ======================================
// GUARDAR NOMBRE
// ======================================

function guardarNombre(userId, nombre) {

    setClientName(userId, nombre.trim());

}

// ======================================
// OBTENER NOMBRE
// ======================================

function obtenerNombre(userId) {

    return getClient(userId).nombre;

}

module.exports = {

    obtenerCliente,

    tieneNombre,

    guardarNombre,

    obtenerNombre

};