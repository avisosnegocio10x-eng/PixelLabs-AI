const {
    getAllConversations
} = require("../memory/memoryManager");

// ======================================
// DASHBOARD
// ======================================

const obtenerDashboard = (req, res) => {

    const conversaciones = getAllConversations();

    const clientes = Object.values(conversaciones);

    const totalClientes = clientes.length;

    const iaActiva = clientes.filter(
        cliente => cliente.iaActiva
    ).length;

    const cotizaciones = clientes.filter(
        cliente => cliente.correoEnviado
    ).length;

    res.json({

        totalClientes,

        iaActiva,

        cotizaciones

    });

};

// ======================================
// LISTA DE CLIENTES
// ======================================

const obtenerClientes = (req, res) => {

    const conversaciones = getAllConversations();

    const clientes = Object.values(conversaciones);

    const listaClientes = clientes.map(cliente => ({

        id: cliente.id,

        nombre: cliente.nombre || "Sin registrar",

        plataforma: cliente.plataforma || "Facebook",

        iaActiva: cliente.iaActiva,

        correoEnviado: cliente.correoEnviado,

        esperandoNombre: cliente.esperandoNombre

    }));

    res.json(listaClientes);

};

module.exports = {

    obtenerDashboard,

    obtenerClientes

};