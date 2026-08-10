const { z, ZodError } = require("zod");
const { TrendRadarService } = require("../services/trendRadarService");
const { EditorialPlannerService } = require("../services/editorialPlannerService");
const { MetricsService } = require("../services/metricsService");

const score = z.number().min(0).max(100);
const sourceSchema = z.object({
    name: z.string().min(3).max(200).optional(),
    sourceType: z.string().min(2).max(80).optional(),
    url: z.string().url().max(2000).optional(),
    collectionMethod: z.enum(["api", "rss", "manual", "first_party"]).optional(),
    termsNotes: z.string().max(1000).optional()
}).strict().optional();
const observationSchema = z.object({
    name: z.string().min(3).max(300),
    summary: z.string().max(1000).optional(),
    externalKey: z.string().max(300).optional(),
    sourceUrl: z.string().url().max(2000).optional(),
    source: sourceSchema,
    region: z.string().max(50).optional(),
    language: z.string().max(10).optional(),
    expiresAt: z.string().datetime().optional(),
    recommendedFormats: z.array(z.string().min(1).max(80)).max(10).optional(),
    signals: z.object({
        relevanceScore: score.optional(),
        salesPotential: score.optional(),
        messagesPotential: score.optional(),
        commentsPotential: score.optional(),
        localInterest: score.optional(),
        conversionEase: score.optional(),
        productAvailability: score.optional(),
        ownedMediaAvailability: score.optional(),
        originalityPotential: score.optional(),
        copyrightRisk: score.optional(),
        trademarkRisk: score.optional(),
        misinformationRisk: score.optional(),
        productionDifficulty: score.optional(),
        expectedDuration: score.optional()
    }).strict().optional()
}).strict();
const trendBatchSchema = z.object({
    observations: z.array(observationSchema).min(1).max(100)
}).strict();
const planSchema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    platforms: z.array(z.enum(["facebook", "instagram", "tiktok"])).min(1).max(3).optional(),
    productReference: z.string().min(3).max(40).optional(),
    campaignId: z.string().uuid().optional(),
    targetAudience: z.string().max(500).optional()
}).strict();
const metricSchema = z.object({
    publishedContentId: z.string().uuid(),
    capturedAt: z.string().datetime().optional(),
    platform: z.enum(["facebook", "instagram", "tiktok"]).optional(),
    views: z.number().int().nonnegative().optional(),
    reach: z.number().int().nonnegative().optional(),
    watchTimeMs: z.number().int().nonnegative().optional(),
    averageRetention: score.optional(),
    likes: z.number().int().nonnegative().optional(),
    comments: z.number().int().nonnegative().optional(),
    shares: z.number().int().nonnegative().optional(),
    saves: z.number().int().nonnegative().optional(),
    profileVisits: z.number().int().nonnegative().optional(),
    clicks: z.number().int().nonnegative().optional(),
    messages: z.number().int().nonnegative().optional(),
    quoteRequests: z.number().int().nonnegative().optional(),
    sales: z.number().int().nonnegative().optional(),
    revenue: z.number().nonnegative().optional(),
    rawMetrics: z.record(z.string(), z.unknown()).optional()
}).strict();
const metricBatchSchema = z.object({ items: z.array(metricSchema).min(1).max(500) }).strict();

function invalid(res, error) {
    if (!(error instanceof ZodError)) return false;
    res.status(422).json({
        ok: false,
        error: "INVALID_OPERATIONS_REQUEST",
        issues: error.issues
    });
    return true;
}

function createOperationsController(options = {}) {
    const trends = options.trends || new TrendRadarService(options);
    const planner = options.planner || new EditorialPlannerService(options);
    const metrics = options.metrics || new MetricsService(options);
    return {
        listTrends: async (req, res, next) => {
            try {
                const items = await trends.listCandidates({
                    minimumScore: req.query.minimumScore,
                    limit: req.query.limit
                });
                res.json({ ok: true, items });
            } catch (error) { next(error); }
        },
        ingestTrends: async (req, res, next) => {
            try {
                const { observations } = trendBatchSchema.parse(req.body || {});
                const items = await trends.ingest(observations);
                res.status(201).json({ ok: true, items });
            } catch (error) { if (!invalid(res, error)) next(error); }
        },
        listCalendar: async (req, res, next) => {
            try {
                const slots = await planner.list(req.query.date);
                res.json({ ok: true, slots });
            } catch (error) { next(error); }
        },
        createPlan: async (req, res, next) => {
            try {
                const result = await planner.createPlan(planSchema.parse(req.body || {}));
                res.status(201).json({ ok: true, ...result });
            } catch (error) { if (!invalid(res, error)) next(error); }
        },
        recordMetrics: async (req, res, next) => {
            try {
                const { items } = metricBatchSchema.parse(req.body || {});
                const metricsWritten = await metrics.recordBatch(items);
                res.status(201).json({ ok: true, metricsWritten });
            } catch (error) { if (!invalid(res, error)) next(error); }
        },
        metricsSummary: async (req, res, next) => {
            try {
                res.json({ ok: true, summary: await metrics.summary(req.query.limit) });
            } catch (error) { next(error); }
        }
    };
}

module.exports = {
    createOperationsController,
    trendBatchSchema,
    planSchema,
    metricBatchSchema
};
