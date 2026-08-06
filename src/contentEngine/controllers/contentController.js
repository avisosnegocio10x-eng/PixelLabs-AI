const { z, ZodError } = require("zod");
const { ContentLifecycleService } = require("../services/contentLifecycleService");
const { createContentRepository } = require("../repositories/contentRepository");

const platform = z.enum(["facebook", "instagram", "tiktok"]);
const score = z.number().min(0).max(100);
const draftSchema = z.object({
    productReference: z.string().min(3).max(40),
    objective: z.string().min(3).max(300),
    audience: z.string().max(500).optional(),
    category: z.string().max(100).optional(),
    format: z.string().min(2).max(80),
    title: z.string().max(300).optional(),
    primaryText: z.string().max(5000).optional(),
    callToAction: z.string().max(500).optional(),
    hashtags: z.array(z.string().max(100)).max(30).default([]),
    platforms: z.array(platform).min(1).max(3)
}).strict();
const reviewSchema = z.object({
    scores: z.object({
        visual: score,
        spelling: score,
        commercial: score,
        brand: score,
        originality: score,
        privacy: score,
        technical: score,
        businessPotential: score
    }).strict(),
    privacyRisk: z.boolean().default(false),
    copyrightRisk: score.default(0),
    trademarkRisk: score.default(0),
    hasThirdPartyWatermark: z.boolean().default(false),
    isDuplicate: z.boolean().default(false),
    templateApproved: z.boolean().default(false),
    newTrend: z.boolean().default(false),
    ownedOrLicensedMedia: z.boolean().default(false),
    attempt: z.number().int().min(1).max(10).default(1),
    model: z.string().max(200).optional(),
    findings: z.record(z.string(), z.array(z.unknown())).optional()
}).strict();
const rejectSchema = z.object({ reason: z.string().min(3).max(1000) }).strict();

function invalid(res, error) {
    if (!(error instanceof ZodError)) return false;
    res.status(422).json({ ok: false, error: "INVALID_CONTENT_REQUEST", issues: error.issues });
    return true;
}

function createContentController(
    service = new ContentLifecycleService(),
    repository = service.repository || createContentRepository()
) {
    return {
        list: async (req, res, next) => {
            try {
                const items = await repository.list({
                    status: req.query.status,
                    productReference: req.query.productReference,
                    limit: req.query.limit
                });
                res.json({ ok: true, items });
            } catch (error) { next(error); }
        },
        create: async (req, res, next) => {
            try {
                const item = await service.createDraft(draftSchema.parse(req.body || {}));
                res.status(201).json({ ok: true, item });
            } catch (error) { if (!invalid(res, error)) next(error); }
        },
        review: async (req, res, next) => {
            try {
                const result = await service.review(req.params.contentId, reviewSchema.parse(req.body || {}));
                res.json({ ok: true, ...result });
            } catch (error) { if (!invalid(res, error)) next(error); }
        },
        approve: async (req, res, next) => {
            try {
                const item = await service.approve(req.params.contentId, {
                    requestId: req.get("x-request-id")
                });
                res.json({ ok: true, item });
            } catch (error) { next(error); }
        },
        reject: async (req, res, next) => {
            try {
                const { reason } = rejectSchema.parse(req.body || {});
                const item = await service.reject(req.params.contentId, reason, {
                    requestId: req.get("x-request-id")
                });
                res.json({ ok: true, item });
            } catch (error) { if (!invalid(res, error)) next(error); }
        }
    };
}

module.exports = {
    createContentController,
    draftSchema,
    reviewSchema,
    rejectSchema
};
