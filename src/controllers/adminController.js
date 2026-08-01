const {
    getAllConversations,
    getClient,
    guardarConversaciones
} = require("../memory/memoryManager");

// ======================================
// DASHBOARD
// ======================================

const obtenerDashboard = (req, res) => {

    const conversaciones = getAllConversations();

    const clientes = Object.values(conversaciones);

    res.json({

        totalClientes: clientes.length,

        iaActiva: clientes.filter(c => c.iaActiva).length,

        cotizaciones: clientes.filter(c => c.correoEnviado).length

    });

};

// ======================================
// CLIENTES
// ======================================

const obtenerClientes = (req, res) => {

    const conversaciones = getAllConversations();

    const clientes = Object.values(conversaciones);

    res.json(clientes);

};

// ======================================
// CAMBIAR ESTADO IA
// ======================================

const cambiarEstadoIA = (req, res) => {

    const { id } = req.params;

    const cliente = getClient(id);

    if (!cliente) {

        return res.status(404).json({

            ok: false,

            mensaje: "Cliente no encontrado"

        });

    }

    cliente.iaActiva = !cliente.iaActiva;

    guardarConversaciones();

    res.json({

        ok: true,

        iaActiva: cliente.iaActiva

    });

};

module.exports = {

    obtenerDashboard,

    obtenerClientes,

    cambiarEstadoIA

};