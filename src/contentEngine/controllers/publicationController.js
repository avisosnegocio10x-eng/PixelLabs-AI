const { z, ZodError } = require("zod");
const { PublicationSchedulerService } = require("../services/publicationSchedulerService");
const { DailyContentPipelineService } = require("../services/dailyContentPipelineService");
const { createMediaAssetRepository } = require("../repositories/mediaAssetRepository");
const { ImageAssetService } = require("../services/imageAssetService");
const { localTimeToIso } = require("../services/editorialPlannerService");

const scheduleSchema = z.object({
    platform: z.enum(["facebook", "instagram", "tiktok"]), scheduledFor: z.string().datetime({ offset: true }).optional(),
    scheduledLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).optional(),
    mode: z.literal("dry-run")
}).strict().refine(input => Boolean(input.scheduledFor) !== Boolean(input.scheduledLocal), "Incluye una fecha absoluta o una fecha local.");

function createPublicationController(options = {}) {
    const scheduler = options.scheduler || new PublicationSchedulerService();
    const daily = options.daily || new DailyContentPipelineService();
    const media = options.media || createMediaAssetRepository();
    const images = new ImageAssetService({ media, catalog: daily.lifecycle.catalog });
    const route = handler => async (req, res, next) => {
        try { await handler(req, res); }
        catch (error) {
            if (error instanceof ZodError) res.status(422).json({ ok: false, error: "INVALID_PUBLICATION_REQUEST", issues: error.issues });
            else next(error);
        }
    };
    return {
        list: route(async (req, res) => res.json({ ok: true, schedules: await scheduler.repository.list(), mode: "dry-run" })),
        schedule: route(async (req, res) => {
            const input = scheduleSchema.parse(req.body || {});
            if (input.scheduledLocal) {
                const settings = await scheduler.lifecycle.settings.getSettings();
                input.scheduledFor = localTimeToIso(input.scheduledLocal.slice(0, 10), input.scheduledLocal.slice(11), settings.timezone);
            }
            res.status(201).json({ ok: true, schedule: await scheduler.schedule(req.params.contentId, input), externalRequestsSent: 0 });
        }),
        runDue: route(async (req, res) => res.json({ ok: true, ...(await scheduler.runDue()) })),
        review: route(async (req, res) => res.json({ ok: true, ...(await daily.reviewer.review(req.params.contentId)) })),
        regenerate: route(async (req, res) => {
            const item = await daily.lifecycle.requireItem(req.params.contentId);
            const result = await daily.generator.generate({ productReference: item.productReference,
                generationKey: `regenerate:${item.id}`, platform: item.platforms[0], format: item.format,
                concept: item.metadata.strategy, plannedFor: item.metadata.plannedFor });
            await daily.lifecycle.reject(item.id, "Sustituido por regeneración solicitada por el usuario.");
            res.status(201).json({ ok: true, ...result });
        }),
        media: route(async (req, res) => {
            const product = await daily.lifecycle.catalog.getByReference(req.params.reference);
            if (!product) return res.status(404).json({ ok: false, error: "PRODUCT_NOT_FOUND" });
            res.json({ ok: true, assets: await media.forProduct(product) });
        }),
        uploadImage: route(async (req, res) => res.status(201).json({ ok: true,
            asset: await images.upload(req.params.reference, req.body, {
                ownership: req.get("x-pixellabs-ownership"), privacy: req.get("x-pixellabs-privacy")
            }) })),
        preview: route(async (req, res) => {
            const url = typeof media.preview === "function" ? await media.preview(req.params.mediaId) : null;
            if (!url) return res.status(409).json({ ok: false, error: "MEDIA_PREVIEW_UNAVAILABLE" });
            res.json({ ok: true, url });
        })
    };
}
module.exports = { createPublicationController, scheduleSchema };
