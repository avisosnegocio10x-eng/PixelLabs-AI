const { createCatalogRepository } = require("../repositories/catalogRepository");
const { ContentSettingsService } = require("./contentSettingsService");
const { TrendRadarService } = require("./trendRadarService");
const { EditorialPlannerService } = require("./editorialPlannerService");
const { ContentLifecycleService } = require("./contentLifecycleService");
const { ContentCorrectionService } = require("./contentCorrectionService");
const { MetricsService } = require("./metricsService");
const { createCrmRepository } = require("../repositories/crmRepository");
const { createContentRepository } = require("../repositories/contentRepository");
const { createWorkflowJobRepository } = require("../repositories/workflowJobRepository");

function createWorkflowHandlers(options = {}) {
    const catalog = options.catalog || createCatalogRepository();
    const settings = options.settings || new ContentSettingsService();
    const trends = options.trendRadar || new TrendRadarService(options);
    const planner = options.planner || new EditorialPlannerService(options);
    const lifecycle = options.lifecycle || new ContentLifecycleService(options);
    const corrections = options.corrections || new ContentCorrectionService(options);
    const metrics = options.metrics || new MetricsService(options);
    const crm = options.crm || createCrmRepository();
    const content = options.content || createContentRepository();
    const jobs = options.jobs || createWorkflowJobRepository();
    return {
        "trend-research": async payload => {
            if (!Array.isArray(payload.observations) || payload.observations.length === 0) {
                const candidates = await trends.listCandidates();
                return {
                    status: candidates.length ? "CANDIDATES_READY" : "WAITING_FOR_SOURCES",
                    collected: 0,
                    candidates,
                    note: "Solo se aceptan APIs oficiales, RSS autorizados, datos propios o carga manual."
                };
            }
            const items = await trends.ingest(payload.observations);
            return {
                status: "RESEARCH_COMPLETED",
                collected: items.length,
                candidates: items.filter(item => item.status === "CANDIDATE"),
                requiresHumanApproval: true
            };
        },
        "editorial-plan": async payload => {
            const date = payload.date || new Date().toISOString().slice(0, 10);
            return planner.createPlan({
                date,
                platforms: payload.platforms,
                productReference: payload.productReference,
                campaignId: payload.campaignId,
                targetAudience: payload.targetAudience
            });
        },
        "content-generation": async payload => {
            const product = payload.productReference
                ? await catalog.getByReference(payload.productReference)
                : null;
            if (!product) {
                return { status: "PRODUCT_REQUIRED", requiresHumanApproval: true };
            }
            if (!["AVAILABLE", "LOW_STOCK"].includes(product.availabilityStatus)) {
                return { status: "PRODUCT_UNAVAILABLE", requiresHumanApproval: true };
            }
            return {
                status: "CONCEPT_INPUT_READY",
                action: payload.action || "create-draft",
                productReference: product.reference,
                verifiedColors: product.compatibleColors,
                verifiedMaterials: product.materials,
                verifiedPrice: product.priceConfirmedAt
                    ? (product.fixedPrice ?? product.priceFrom)
                    : null,
                requiresModelProvider: true,
                requiresHumanApproval: true,
                autoPublish: false
            };
        },
        "video-processing": async payload => ({
            status: payload.uploadId ? "VIDEO_QUEUE_HANDLED_BY_BACKEND" : "UPLOAD_ID_REQUIRED",
            uploadId: payload.uploadId || null,
            autoPublish: false
        }),
        "clip-editing": async payload => ({
            status: payload.clipId ? "RENDER_REQUEST_REQUIRES_STYLE" : "CLIP_ID_REQUIRED",
            clipId: payload.clipId || null,
            requiresHumanApproval: true
        }),
        "multi-review": async payload => {
            if (!payload.contentId) return { status: "CONTENT_ID_REQUIRED" };
            if (!payload.scores) {
                return {
                    status: "REVIEW_INPUT_REQUIRED",
                    requiredReviews: [
                        "visual", "spelling", "commercial", "brand",
                        "originality", "privacy", "technical", "businessPotential"
                    ],
                    requiresHumanApproval: true
                };
            }
            const result = await lifecycle.review(payload.contentId, payload);
            return { status: "REVIEW_COMPLETED", ...result, requiresHumanApproval: true };
        },
        "content-correction": async payload => payload.contentId
            ? corrections.correct(payload.contentId)
            : {
                status: "CONTENT_ID_REQUIRED",
                maxAutomaticAttempts: (await settings.getSettings()).maxCorrectionAttempts,
                publishOnFailure: false
            },
        "approval-routing": async payload => {
            if (!payload.contentId) return { status: "CONTENT_ID_REQUIRED", autoPublish: false };
            const item = await lifecycle.requireItem(payload.contentId);
            return {
                status: item.status === "REQUIRES_HUMAN_APPROVAL"
                    ? "REQUIRES_HUMAN_APPROVAL"
                    : "NOT_READY_FOR_APPROVAL",
                contentId: item.id,
                contentStatus: item.status,
                autoPublish: false
            };
        },
        "schedule-publish": async () => {
            const current = await settings.getSettings();
            if (!current.enabled) {
                return { status: "BLOCKED", reason: "ENGINE_STOPPED", externalRequestsSent: 0 };
            }
            if (!current.autoPublish || current.approvalMode === "manual") {
                return { status: "BLOCKED", reason: "AUTO_PUBLISH_DISABLED", externalRequestsSent: 0 };
            }
            return {
                status: "BLOCKED",
                reason: "LIVE_SOCIAL_CONNECTORS_NOT_AUTHORIZED",
                externalRequestsSent: 0
            };
        },
        "metrics-sync": async payload => {
            if (!Array.isArray(payload.items) || payload.items.length === 0) {
                return {
                    status: "WAITING_FOR_CONNECTED_SOCIAL_ACCOUNTS",
                    metricsWritten: 0,
                    summary: await metrics.summary()
                };
            }
            const written = await metrics.recordBatch(payload.items);
            return { status: "METRICS_SAVED", metricsWritten: written.length };
        },
        "weekly-optimization": async () => {
            const [recommendations, crmSummary, contentItems, products] = await Promise.all([
                metrics.weeklyRecommendations(),
                crm.dashboard(),
                content.list({ limit: 250 }),
                catalog.list()
            ]);
            return {
                ...recommendations,
                crm: crmSummary,
                contentLibrary: {
                    total: contentItems.length,
                    waitingHumanApproval: contentItems.filter(item => (
                        item.status === "REQUIRES_HUMAN_APPROVAL"
                    )).length
                },
                catalog: {
                    total: products.length,
                    available: products.filter(product => (
                        ["AVAILABLE", "LOW_STOCK"].includes(product.availabilityStatus)
                    )).length
                },
                automaticSettingsChanged: false,
                autoPublish: false
            };
        },
        "error-recovery": async payload => {
            const failed = await jobs.listByStatuses(["FAILED"]);
            return {
                status: failed.length ? "SAFE_RETRY_REVIEW_REQUIRED" : "NO_FAILED_JOBS",
                errorId: payload.errorId || null,
                failedJobs: failed.slice(0, 100).map(job => ({
                    id: job.id,
                    workflow: job.type,
                    errorCode: job.errorCode,
                    attempt: job.attempt,
                    maxAttempts: job.maxAttempts,
                    completedAt: job.completedAt
                })),
                automaticRetryStarted: false,
                humanApprovalRequired: true
            };
        }
    };
}

module.exports = {
    createWorkflowHandlers
};
