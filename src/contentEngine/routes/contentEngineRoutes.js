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
const { createCatalogController } = require("../controllers/catalogController");
const { createContentController } = require("../controllers/contentController");
const { VideoLibraryService } = require("../video/videoLibraryService");
const { createVideoLibraryController } = require("../controllers/videoLibraryController");
const { createSocialController } = require("../controllers/socialController");

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
    const catalogController = createCatalogController();
    const contentController = createContentController();
    const videoLibrary = new VideoLibraryService(uploadService);
    const videoLibraryController = createVideoLibraryController(videoLibrary);
    const socialController = createSocialController();
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
    router.get("/videos", videoLibraryController.videos);
    router.get("/clips", videoLibraryController.clips);
    router.post(
        "/videos/:uploadId/clips/:clipId/render",
        videoLibraryController.render
    );
    router.post(
        "/videos/:uploadId/clips/:clipId/review",
        videoLibraryController.review
    );

    router.post("/jobs/:workflow", workflowJobController.create);
    router.get("/jobs/status/:jobId", workflowJobController.get);
    router.patch("/jobs/status/:jobId", workflowJobController.update);

    router.get("/catalog/products", catalogController.list);
    router.get("/catalog/products/:reference", catalogController.get);
    router.patch(
        "/catalog/products/:reference/availability",
        catalogController.setAvailability
    );
    router.post(
        "/catalog/products/:reference/promotion-cooldown",
        catalogController.setCooldown
    );
    router.post("/catalog/products/:reference/actions", catalogController.action);

    router.get("/content", contentController.list);
    router.post("/content", contentController.create);
    router.post("/content/:contentId/review", contentController.review);
    router.post("/content/:contentId/approve", contentController.approve);
    router.post("/content/:contentId/reject", contentController.reject);
    router.get("/social/capabilities", socialController.capabilities);
    router.post(
        "/content/:contentId/export/:platform",
        socialController.exportVariant
    );

    setImmediate(() => {
        videoCoordinator.recover().catch(error => {
            console.error("No se pudo recuperar la cola de video", error.message);
        });
        workflowJobController.runner.recover().catch(error => {
            console.error("No se pudo recuperar la cola de flujos", error.message);
        });
    });

    return router;
}

module.exports = {
    createContentEngineRoutes
};
