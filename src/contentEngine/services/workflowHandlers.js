const { createCatalogRepository } = require("../repositories/catalogRepository");
const { ContentSettingsService } = require("./contentSettingsService");

function createWorkflowHandlers(options = {}) {
    const catalog = options.catalog || createCatalogRepository();
    const settings = options.settings || new ContentSettingsService();
    return {
        "trend-research": async () => ({
            status: "WAITING_FOR_SOURCES",
            collected: 0,
            note: "No se recopilan tendencias hasta configurar una fuente oficial o RSS autorizada."
        }),
        "editorial-plan": async payload => {
            const products = await catalog.list({ promotableOnly: true, limit: 100 });
            return {
                status: products.length ? "PLAN_READY" : "NO_PROMOTABLE_PRODUCTS",
                requiresHumanApproval: true,
                requestedAction: payload.action || null,
                products: products.map(product => ({
                    reference: product.reference,
                    name: product.name,
                    availabilityStatus: product.availabilityStatus,
                    promotionBlockedUntil: product.promotionBlockedUntil
                }))
            };
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
        "multi-review": async payload => ({
            status: payload.contentId ? "REVIEW_INPUT_REQUIRED" : "CONTENT_ID_REQUIRED",
            requiredReviews: [
                "visual", "spelling", "commercial", "brand",
                "originality", "privacy", "technical", "business_potential"
            ],
            requiresHumanApproval: true
        }),
        "content-correction": async payload => ({
            status: "CORRECTION_CLASSIFICATION_REQUIRED",
            contentId: payload.contentId || null,
            maxAutomaticAttempts: (await settings.getSettings()).maxCorrectionAttempts,
            publishOnFailure: false
        }),
        "approval-routing": async payload => ({
            status: "REQUIRES_HUMAN_APPROVAL",
            contentId: payload.contentId || null,
            autoPublish: false
        }),
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
        "metrics-sync": async () => ({
            status: "WAITING_FOR_CONNECTED_SOCIAL_ACCOUNTS",
            metricsWritten: 0
        }),
        "weekly-optimization": async () => ({
            status: "NO_VERIFIED_METRICS",
            automaticSettingsChanged: false,
            recommendations: []
        }),
        "error-recovery": async payload => ({
            status: "SAFE_RETRY_REVIEW_REQUIRED",
            errorId: payload.errorId || null,
            automaticRetryStarted: false
        })
    };
}

module.exports = {
    createWorkflowHandlers
};
