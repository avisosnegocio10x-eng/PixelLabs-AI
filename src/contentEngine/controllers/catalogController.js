const { z, ZodError } = require("zod");
const {
    PRODUCT_STATUSES,
    createCatalogRepository
} = require("../repositories/catalogRepository");
const { WorkflowJobService } = require("../services/workflowJobService");

const availabilitySchema = z.object({
    availabilityStatus: z.enum(PRODUCT_STATUSES)
}).strict();

const cooldownSchema = z.object({
    days: z.number().int().min(0).max(365)
}).strict();

const actionSchema = z.object({
    action: z.enum(["create-ideas", "create-reel", "create-carousel", "add-to-campaign"]),
    campaignId: z.string().uuid().optional()
}).strict().superRefine((value, context) => {
    if (value.action === "add-to-campaign" && !value.campaignId) {
        context.addIssue({ code: "custom", message: "campaignId es obligatorio." });
    }
});

function invalid(res, error) {
    if (!(error instanceof ZodError)) return false;
    res.status(422).json({ ok: false, error: "INVALID_CATALOG_REQUEST", issues: error.issues });
    return true;
}

function createCatalogController(
    repository = createCatalogRepository(),
    jobs = new WorkflowJobService()
) {
    return {
        list: async (req, res, next) => {
            try {
                const products = await repository.list({
                    search: req.query.q,
                    availabilityStatus: req.query.status,
                    promotableOnly: req.query.promotable === "true",
                    limit: req.query.limit
                });
                res.json({ ok: true, products });
            } catch (error) { next(error); }
        },
        get: async (req, res, next) => {
            try {
                const product = await repository.getByReference(req.params.reference);
                if (!product) return res.status(404).json({ ok: false, error: "PRODUCT_NOT_FOUND" });
                res.json({ ok: true, product });
            } catch (error) { next(error); }
        },
        setAvailability: async (req, res, next) => {
            try {
                const data = availabilitySchema.parse(req.body || {});
                const product = await repository.update(req.params.reference, data);
                res.json({ ok: true, product });
            } catch (error) { if (!invalid(res, error)) next(error); }
        },
        setCooldown: async (req, res, next) => {
            try {
                const { days } = cooldownSchema.parse(req.body || {});
                const blockedUntil = days === 0
                    ? null
                    : new Date(Date.now() + days * 86400000).toISOString();
                const product = await repository.update(req.params.reference, {
                    promotionBlockedUntil: blockedUntil
                });
                res.json({ ok: true, product });
            } catch (error) { if (!invalid(res, error)) next(error); }
        },
        action: async (req, res, next) => {
            try {
                const data = actionSchema.parse(req.body || {});
                const product = await repository.getByReference(req.params.reference);
                if (!product) return res.status(404).json({ ok: false, error: "PRODUCT_NOT_FOUND" });
                if (["OUT_OF_STOCK", "PAUSED", "ARCHIVED"].includes(product.availabilityStatus)) {
                    return res.status(409).json({ ok: false, error: "PRODUCT_UNAVAILABLE" });
                }
                const workflow = data.action === "create-ideas" ? "editorial-plan" : "content-generation";
                const job = await jobs.create(workflow, {
                    action: data.action,
                    productReference: product.reference,
                    campaignId: data.campaignId || null,
                    requiresHumanApproval: true
                }, `catalog:${product.reference}:${data.action}:${data.campaignId || "none"}`);
                res.status(202).json({ ok: true, job });
            } catch (error) { if (!invalid(res, error)) next(error); }
        }
    };
}

module.exports = {
    createCatalogController,
    availabilitySchema,
    cooldownSchema,
    actionSchema
};
