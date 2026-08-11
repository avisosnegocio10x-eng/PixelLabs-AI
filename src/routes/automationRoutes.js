const express = require("express");
const rateLimit = require("express-rate-limit");
const { requireAutomationAuth } = require("../middleware/automationAuth");
const { createWorkflowJobController } = require("../contentEngine/controllers/workflowJobController");

const router = express.Router();
const controller = createWorkflowJobController();

router.use(rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: "draft-8",
    legacyHeaders: false
}));
router.use(requireAutomationAuth);

router.post("/jobs/:workflow", controller.create);
router.get("/jobs/status/:jobId", controller.get);

module.exports = router;
