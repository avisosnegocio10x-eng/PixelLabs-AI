const { z, ZodError } = require("zod");
const { CLIP_STYLES } = require("../video/videoLibraryService");

const renderSchema = z.object({ style: z.enum(CLIP_STYLES) }).strict();
const reviewSchema = z.object({
    decision: z.enum(["APPROVE", "REJECT"]),
    privacyCleared: z.boolean(),
    qualityScore: z.number().min(0).max(100),
    notes: z.string().max(2000).optional()
}).strict();

function invalid(res, error) {
    if (!(error instanceof ZodError)) return false;
    res.status(422).json({ ok: false, error: "INVALID_CLIP_REQUEST", issues: error.issues });
    return true;
}

function createVideoLibraryController(service) {
    return {
        videos: async (req, res, next) => {
            try { res.json({ ok: true, videos: await service.listVideos() }); }
            catch (error) { next(error); }
        },
        clips: async (req, res, next) => {
            try {
                res.json({ ok: true, clips: await service.listClips({
                    status: req.query.status,
                    platform: req.query.platform
                }) });
            } catch (error) { next(error); }
        },
        render: async (req, res, next) => {
            try {
                const { style } = renderSchema.parse(req.body || {});
                const clip = await service.render(req.params.uploadId, req.params.clipId, style);
                res.status(202).json({ ok: true, clip });
            } catch (error) { if (!invalid(res, error)) next(error); }
        },
        review: async (req, res, next) => {
            try {
                const clip = await service.review(
                    req.params.uploadId,
                    req.params.clipId,
                    reviewSchema.parse(req.body || {})
                );
                res.json({ ok: true, clip });
            } catch (error) { if (!invalid(res, error)) next(error); }
        }
    };
}

module.exports = {
    createVideoLibraryController,
    renderSchema,
    reviewSchema
};
