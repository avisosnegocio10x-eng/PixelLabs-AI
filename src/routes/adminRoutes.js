const express = require("express");
const path = require("path");

const {

    obtenerDashboard,

    obtenerClientes,

    cambiarEstadoIA

} = require("../controllers/adminController");

const router = express.Router();

// ======================================
// PANEL ADMINISTRATIVO
// ======================================

router.get("/", (req, res) => {

    res.sendFile(

        path.join(
            __dirname,
            "../views/admin.html"
        )

    );

});

// ======================================
// API DEL DASHBOARD
// ======================================

router.get(

    "/api/dashboard",

    obtenerDashboard

);

// ======================================
// API DE CLIENTES
// ======================================

router.get(

    "/api/clientes",

    obtenerClientes

);

// ======================================
// ACTIVAR / DESACTIVAR IA
// ======================================

router.post(

    "/api/ia/:id",

    cambiarEstadoIA

);

module.exports = router;