const { ContentLifecycleService } = require("./contentLifecycleService");
const { EditorialPlannerService } = require("./editorialPlannerService");
const { ContentGenerationService } = require("./contentGenerationService");
const { AutomaticContentReviewService } = require("./automaticContentReviewService");
const { ContentCorrectionService } = require("./contentCorrectionService");
const { GeminiContentProvider } = require("./geminiContentProvider");
const { createPublicationRepository } = require("../repositories/publicationRepository");

function editorialDate(timezone, now = new Date()) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);
}

class DailyContentPipelineService {
    constructor(options = {}) {
        this.lifecycle = options.lifecycle || new ContentLifecycleService();
        this.planner = options.planner || new EditorialPlannerService({ catalog: this.lifecycle.catalog, settings: this.lifecycle.settings });
        const publications = options.publications || createPublicationRepository();
        const limit = Number(process.env.CONTENT_ENGINE_GEMINI_MAX_REQUESTS_PER_DAY || 12);
        const budget = options.budget || {
            reserve: purpose => publications.reserve(purpose, Number.isInteger(limit) && limit > 0 && limit <= 100 ? limit : 12)
        };
        const provider = options.provider || new GeminiContentProvider();
        this.generator = options.generator || new ContentGenerationService({ ...options, lifecycle: this.lifecycle, provider, budget });
        this.reviewer = options.reviewer || new AutomaticContentReviewService({ ...options, lifecycle: this.lifecycle, provider, budget });
        this.corrections = options.corrections || new ContentCorrectionService({ repository: this.lifecycle.repository, settings: this.lifecycle.settings });
    }

    async runDay(input = {}) {
        const settings = await this.lifecycle.settings.getSettings();
        const date = input.date || editorialDate(settings.timezone);
        const plan = await this.planner.createPlan({ ...input, date });
        if (plan.status !== "PLAN_READY") return { ...plan, externalRequestsSent: 0 };
        const results = [];
        // Sequential, quota limited, and resumable by the existing idea/generation keys.
        for (const slot of plan.slots) {
            try {
                const generated = await this.generator.generate({
                    ideaId: slot.id, generationKey: slot.planKey,
                    productReference: slot.metadata.productReference, platform: slot.platform,
                    format: slot.recommendedFormats[0], concept: slot.concept, category: slot.category,
                    objective: slot.objective, plannedFor: slot.plannedFor
                });
                let item = generated.item;
                if (input.review !== false && ["DRAFT", "UNDER_REVIEW"].includes(item.status)) {
                    item = (await this.reviewer.review(item.id)).item;
                }
                if (input.review !== false && item.status === "NEEDS_CORRECTION") {
                    const corrected = await this.corrections.correct(item.id);
                    if (corrected.corrected) item = (await this.reviewer.review(item.id)).item;
                }
                results.push({ contentId: item.id, platform: slot.platform, status: item.status,
                    mediaRequired: Boolean(item.metadata.mediaMissing), plannedFor: slot.plannedFor });
            } catch (error) {
                results.push({ ideaId: slot.id, platform: slot.platform, status: "BLOCKED",
                    reason: error.code || "CONTENT_GENERATION_FAILED" });
                if (["CONTENT_AI_DISABLED", "GEMINI_KEY_REQUIRED", "GEMINI_FREE_TIER_NOT_CONFIRMED",
                    "GEMINI_DAILY_REQUEST_LIMIT", "GEMINI_FREE_QUOTA_EXHAUSTED"].includes(error.code)) break;
            }
        }
        return { status: "DAILY_PIPELINE_REVIEW_REQUIRED", date, results,
            awaitingApproval: results.filter(item => item.status === "REQUIRES_HUMAN_APPROVAL").length,
            requiresHumanApproval: true, autoPublish: false, externalRequestsSent: 0 };
    }

    async reviewPending() {
        const items = (await this.lifecycle.repository.list({ limit: 250 }))
            .filter(item => ["DRAFT", "UNDER_REVIEW"].includes(item.status));
        const results = [];
        for (const item of items.slice(0, 12)) results.push(await this.reviewer.review(item.id));
        return { status: "BATCH_REVIEW_COMPLETED", results, autoPublish: false };
    }
}

module.exports = { DailyContentPipelineService, editorialDate };
