const express = require("express");
const router = express.Router();
const { verifyMetaWebhookSignature } = require("../middleware/metaWebhookAuth");

const {
    verifyWebhook,
    receiveMessage
} = require("../controllers/webhookControllerV2");

// Verificación que hace Meta
router.get("/", verifyWebhook);

// Mensajes que llegan desde Messenger
router.post("/", verifyMetaWebhookSignature, receiveMessage);

module.exports = router;
