const express = require("express");
const router = express.Router();

const {
    verifyWebhook,
    receiveMessage
} = require("../controllers/webhookController");

// Verificación que hace Meta
router.get("/", verifyWebhook);

// Mensajes que llegan desde Messenger
router.post("/", receiveMessage);

module.exports = router;