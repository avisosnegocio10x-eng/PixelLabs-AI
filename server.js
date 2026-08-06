require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");

const webhookRoutes = require("./src/routes/webhook");
const adminRoutes = require("./src/routes/adminRoutes");
const legalRoutes = require("./src/routes/legalRoutes");
const { errorHandler } = require("./src/middleware/errorHandler");

function createApp() {
    const app = express();

    if (process.env.TRUST_PROXY === "true") {
        app.set("trust proxy", 1);
    }

    app.disable("x-powered-by");
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                "style-src": ["'self'", "'unsafe-inline'"]
            }
        }
    }));
    app.use(cors({
        origin: process.env.CORS_ORIGINS
            ? process.env.CORS_ORIGINS.split(",").map(value => value.trim())
            : false
    }));
    app.use(express.json({ limit: "2mb" }));

// ============================
// ARCHIVOS PÚBLICOS
// ============================

    app.use(
        express.static(
            path.join(__dirname, "src/public")
        )
    );

// ============================
// RUTAS
// ============================

    app.use("/webhook", webhookRoutes);

    app.use("/admin", adminRoutes);

    app.use("/", legalRoutes);

// ============================

    app.get("/", (req, res) => {

        res.send("🚀 PixelLabs AI funcionando correctamente.");

    });

    app.use(errorHandler);

    return app;
}

const PORT = process.env.PORT || 3000;

if (require.main === module) {
    createApp().listen(PORT, () => {

        console.log(`Servidor iniciado en el puerto ${PORT}`);

    });
}

module.exports = {
    createApp
};
