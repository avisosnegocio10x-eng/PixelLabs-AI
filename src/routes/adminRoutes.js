const express = require("express");
const path = require("path");
const rateLimit = require("express-rate-limit");
const { requireAdminAuth } = require("../middleware/adminAuth");
const {
    createContentEngineRoutes
} = require("../contentEngine/routes/contentEngineRoutes");

const {

    obtenerDashboard,

    obtenerClientes,

    cambiarEstadoIA

} = require("../controllers/adminController");

const router = express.Router();

const adminApiLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: "draft-8",
    legacyHeaders: false
});

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

router.use("/api", adminApiLimiter, requireAdminAuth);

router.use(
    "/api/content-engine",
    createContentEngineRoutes()
);

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
