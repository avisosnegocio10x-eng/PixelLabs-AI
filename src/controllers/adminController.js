const { createCrmRepository } = require("../contentEngine/repositories/crmRepository");

const crm = createCrmRepository();

// ======================================
// DASHBOARD
// ======================================

const obtenerDashboard = async (req, res, next) => {
    try {
        res.json(await crm.dashboard());
    } catch (error) {
        next(error);
    }
};

// ======================================
// CLIENTES
// ======================================

const obtenerClientes = async (req, res, next) => {
    try {
        res.json(await crm.listContacts());
    } catch (error) {
        next(error);
    }
};

// ======================================
// CAMBIAR ESTADO IA
// ======================================

const cambiarEstadoIA = async (req, res, next) => {
    try {
        const contact = await crm.toggleAi(req.body?.plataforma || "messenger", req.params.id);
        res.json({ ok: true, iaActiva: contact.iaActiva });
    } catch (error) {
        next(error);
    }
};

module.exports = {

    obtenerDashboard,

    obtenerClientes,

    cambiarEstadoIA

};
