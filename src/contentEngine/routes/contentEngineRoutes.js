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
const { createOperationsController } = require("../controllers/operationsController");
const {
    getSupabaseAdminClient,
    hasSupabaseConfiguration
} = require("../db/supabaseClient");
const {
    resolveVideoRuntime,
    disabledVideoResponse
} = require("../video/videoRuntimePolicy");

function createContentEngineRoutes() {
    const router = express.Router();
    const settingsController = createSettingsController();
    const videoRuntime = resolveVideoRuntime();
    const uploadService = videoRuntime.enabled ? new UploadSessionService() : null;
    const videoCoordinator = uploadService
        ? new VideoProcessingCoordinator(uploadService)
        : null;
    const videoUploadController = uploadService
        ? createVideoUploadController(uploadService, videoCoordinator)
        : null;
    const workflowJobController = createWorkflowJobController();
    const catalogController = createCatalogController();
    const contentController = createContentController();
    const videoLibrary = uploadService ? new VideoLibraryService(uploadService) : null;
    const videoLibraryController = videoLibrary
        ? createVideoLibraryController(videoLibrary)
        : null;
    const socialController = createSocialController();
    const operationsController = createOperationsController();
    const rawChunk = express.raw({
        type: ["application/octet-stream", "video/*"],
        limit: "128mb"
    });

    router.get("/health", async (req, res, next) => {
        try {
            const configured = hasSupabaseConfiguration();
            let databaseReachable = false;
            if (configured) {
                const { error } = await getSupabaseAdminClient()
                    .from("content_settings")
                    .select("scope", { head: true, count: "exact" })
                    .eq("scope", "global");
                if (error) throw new Error(`Supabase no está listo: ${error.message}`);
                databaseReachable = true;
            }
            res.json({
                ok: true,
                service: "pixellabs-content-engine",
                persistence: configured ? "supabase" : "local",
                databaseReachable,
                autoPublishDefault: false,
                videoRuntime
            });
        } catch (error) { next(error); }
    });

    router.get("/settings", settingsController.get);
    router.patch("/settings", settingsController.update);
    router.post("/emergency-stop", settingsController.emergencyStop);

    router.get("/trends", operationsController.listTrends);
    router.post("/trends/ingest", operationsController.ingestTrends);
    router.get("/calendar", operationsController.listCalendar);
    router.post("/calendar/plan", operationsController.createPlan);
    router.get("/metrics/summary", operationsController.metricsSummary);
    router.post("/metrics", operationsController.recordMetrics);

    if (videoRuntime.enabled) {
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
    } else {
        const unavailable = (req, res) => {
            res.status(503).json(disabledVideoResponse(videoRuntime));
        };
        router.get("/videos", (req, res) => {
            res.json({ ok: true, videos: [], videoRuntime });
        });
        router.get("/clips", (req, res) => {
            res.json({ ok: true, clips: [], videoRuntime });
        });
        router.post("/videos/uploads", unavailable);
        router.get("/videos/uploads/:uploadId", unavailable);
        router.put("/videos/uploads/:uploadId/chunks", rawChunk, unavailable);
        router.post("/videos/uploads/:uploadId/complete", unavailable);
        router.post("/videos/uploads/:uploadId/pause", unavailable);
        router.post("/videos/uploads/:uploadId/resume", unavailable);
        router.post("/videos/:uploadId/clips/:clipId/render", unavailable);
        router.post("/videos/:uploadId/clips/:clipId/review", unavailable);
    }

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
        if (videoCoordinator) {
            videoCoordinator.recover().catch(error => {
                console.error("No se pudo recuperar la cola de video", error.message);
            });
        }
        workflowJobController.runner.recover().catch(error => {
            console.error("No se pudo recuperar la cola de flujos", error.message);
        });
    });

    return router;
}

module.exports = {
    createContentEngineRoutes
};
