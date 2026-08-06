const { ZodError } = require("zod");
const { UploadSessionService } = require("../video/uploadSessionService");

function createVideoUploadController(
    service = new UploadSessionService(),
    coordinator = null
) {
    return {
        create: async (req, res, next) => {
            try {
                const upload = await service.create(req.body || {});
                res.status(201).json({ ok: true, upload });
            } catch (error) {
                if (error instanceof ZodError) {
                    return res.status(422).json({
                        ok: false,
                        error: "INVALID_UPLOAD",
                        issues: error.issues
                    });
                }
                next(error);
            }
        },

        status: async (req, res, next) => {
            try {
                res.json({ ok: true, upload: await service.get(req.params.uploadId) });
            } catch (error) {
                next(error);
            }
        },

        chunk: async (req, res, next) => {
            try {
                const upload = await service.writeChunk(
                    req.params.uploadId,
                    req.get("content-range"),
                    req.body
                );
                res.json({ ok: true, upload });
            } catch (error) {
                next(error);
            }
        },

        complete: async (req, res, next) => {
            try {
                const upload = await service.complete(req.params.uploadId);
                if (coordinator) {
                    setImmediate(() => coordinator.enqueue(upload.uploadId));
                }
                res.json({ ok: true, upload });
            } catch (error) {
                next(error);
            }
        },

        pause: async (req, res, next) => {
            try {
                if (!coordinator) {
                    throw Object.assign(new Error("Procesador de video no disponible."), {
                        statusCode: 503,
                        code: "VIDEO_PROCESSOR_UNAVAILABLE"
                    });
                }
                res.json({ ok: true, upload: await coordinator.pause(req.params.uploadId) });
            } catch (error) {
                next(error);
            }
        },

        resume: async (req, res, next) => {
            try {
                if (!coordinator) {
                    throw Object.assign(new Error("Procesador de video no disponible."), {
                        statusCode: 503,
                        code: "VIDEO_PROCESSOR_UNAVAILABLE"
                    });
                }
                res.json({ ok: true, upload: await coordinator.resume(req.params.uploadId) });
            } catch (error) {
                next(error);
            }
        }
    };
}

module.exports = {
    createVideoUploadController
};
