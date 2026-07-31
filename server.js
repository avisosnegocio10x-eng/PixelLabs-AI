require("dotenv").config();

const express = require("express");
const cors = require("cors");

const webhookRoutes = require("./src/routes/webhook");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/webhook", webhookRoutes);

app.get("/", (req, res) => {
    res.send("🚀 PixelLabs AI funcionando correctamente.");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Servidor iniciado en el puerto ${PORT}`);
});