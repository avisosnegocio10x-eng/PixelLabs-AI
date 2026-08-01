require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

const webhookRoutes = require("./src/routes/webhook");
const adminRoutes = require("./src/routes/adminRoutes");
const legalRoutes = require("./src/routes/legalRoutes");

const app = express();

app.use(cors());

app.use(express.json());

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

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {

    console.log(`Servidor iniciado en el puerto ${PORT}`);

});