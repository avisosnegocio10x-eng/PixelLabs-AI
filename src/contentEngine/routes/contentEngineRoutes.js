const express = require("express");
const { createSettingsController } = require("../controllers/settingsController");
const {
    createVideoUploadController
} = require("../controllers/videoUploadController");
const { UploadSessionService } = require("../video/uploadSessionService");
const {
    VideoProcessingCoordinator
} = require("../video/videoProcessingCoordinator");
const {
    createWorkflowJobController
} = require("../controllers/workflowJobController");

function createContentEngineRoutes() {
    const router = express.Router();
    const settingsController = createSettingsController();
    const uploadService = new UploadSessionService();
    const videoCoordinator = new VideoProcessingCoordinator(uploadService);
    const videoUploadController = createVideoUploadController(
        uploadService,
        videoCoordinator
    );
    const workflowJobController = createWorkflowJobController();
    const rawChunk = express.raw({
        type: ["application/octet-stream", "video/*"],
        limit: "128mb"
    });

    router.get("/health", (req, res) => {
        res.json({
            ok: true,
            service: "pixellabs-content-engine",
            autoPublishDefault: false
        });
    });

    router.get("/settings", settingsController.get);
    router.patch("/settings", settingsController.update);
    router.post("/emergency-stop", settingsController.emergencyStop);

    router.post("/videos/uploads", videoUploadController.create);
    router.get("/videos/uploads/:uploadId", videoUploadController.status);
    router.put(
        "/videos/uploads/:uploadId/chunks",
        rawChunk,
        videoUploadController.chunk
    );
    router.post(
        "/videos/uploads/:uploadId/complete",
        videoUploadController.complete
    );
    router.post("/videos/uploads/:uploadId/pause", videoUploadController.pause);
    router.post("/videos/uploads/:uploadId/resume", videoUploadController.resume);

    router.post("/jobs/:workflow", workflowJobController.create);
    router.get("/jobs/status/:jobId", workflowJobController.get);

    setImmediate(() => {
        videoCoordinator.recover().catch(error => {
            console.error("No se pudo recuperar la cola de video", error.message);
        });
    });

    return router;
}

module.exports = {
    createContentEngineRoutes
};
