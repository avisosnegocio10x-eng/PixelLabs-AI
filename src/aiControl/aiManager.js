// =====================================
// IA MANAGER
// PixelLabs AI
// =====================================

const estadosIA = {};

// ================================
// ACTIVAR IA
// ================================

function activarIA(senderId) {

    estadosIA[senderId] = true;

}

// ================================
// DESACTIVAR IA
// ================================

function desactivarIA(senderId) {

    estadosIA[senderId] = false;

}

// ================================
// CONSULTAR ESTADO
// ================================

function iaActiva(senderId) {

    // Si nunca se ha registrado,
    // por defecto la IA está activa.

    if (estadosIA[senderId] === undefined) {

        estadosIA[senderId] = true;

    }

    return estadosIA[senderId];

}

// ================================

module.exports = {

    activarIA,

    desactivarIA,

    iaActiva

};