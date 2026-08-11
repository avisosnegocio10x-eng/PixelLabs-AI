const express = require("express");
const rateLimit = require("express-rate-limit");
const { requireLocalWorkerAuth } = require("../middleware/localWorkerAuth");
const { createLocalWorkerController } = require("../contentEngine/controllers/localWorkerController");

const router = express.Router();
const controller = createLocalWorkerController();

router.use(rateLimit({
    windowMs: 60 * 1000,
    limit: 240,
    standardHeaders: "draft-8",
    legacyHeaders: false
}));
router.use(requireLocalWorkerAuth);

router.post("/jobs", controller.create);
router.post("/jobs/claim", controller.claim);
router.post("/jobs/:jobId/heartbeat", controller.heartbeat);
router.post("/jobs/:jobId/artifacts/ticket", controller.ticket);
router.post("/jobs/:jobId/complete", controller.complete);
router.post("/jobs/:jobId/fail", controller.fail);

module.exports = router;
