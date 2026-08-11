const express = require("express");
const rateLimit = require("express-rate-limit");
const { requireAutomationAuth } = require("../middleware/automationAuth");
const { createWorkflowJobController } = require("../contentEngine/controllers/workflowJobController");

const router = express.Router();
const controller = createWorkflowJobController(undefined, undefined, {
    requireIdempotencyKey: true,
    requireN8nSource: true,
    requireWorkflowBinding: true
});

router.use(rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: "draft-8",
    legacyHeaders: false
}));
router.use(requireAutomationAuth);
router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    res.set("Pragma", "no-cache");
    next();
});

router.get("/readiness", controller.readiness);
router.post("/jobs/:workflow", controller.create);
router.get("/jobs/status/:jobId", controller.get);

module.exports = router;
