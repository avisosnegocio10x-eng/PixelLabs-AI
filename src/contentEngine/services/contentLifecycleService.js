const { createContentRepository, fingerprint } = require("../repositories/contentRepository");
const { createCatalogRepository } = require("../repositories/catalogRepository");
const { ContentSettingsService } = require("./contentSettingsService");
const { REVIEW_TYPES, decideContent } = require("../review/contentDecisionService");

const DB_REVIEW_NAMES = {
    visual: "visual",
    spelling: "spelling",
    commercial: "commercial",
    brand: "brand",
    originality: "originality",
    privacy: "privacy",
    technical: "technical",
    businessPotential: "business_potential"
};

class ContentLifecycleService {
    constructor(options = {}) {
        this.repository = options.repository || createContentRepository();
        this.catalog = options.catalog || createCatalogRepository();
        this.settings = options.settings || new ContentSettingsService();
    }

    async createDraft(input) {
        const product = await this.catalog.getByReference(input.productReference);
        if (!product) {
            throw Object.assign(new Error("Producto no encontrado."), {
                statusCode: 404,
                code: "PRODUCT_NOT_FOUND"
            });
        }
        if (!["AVAILABLE", "LOW_STOCK"].includes(product.availabilityStatus)) {
            throw Object.assign(new Error("El producto no está disponible."), {
                statusCode: 409,
                code: "PRODUCT_UNAVAILABLE"
            });
        }
        const contentFingerprint = fingerprint({
            productReference: product.reference,
            objective: input.objective,
            format: input.format,
            title: input.title || null,
            primaryText: input.primaryText || null,
            platforms: [...input.platforms].sort()
        });
        return this.repository.createDraft({
            ...input,
            productId: product.id,
            category: input.category || product.category,
            metadata: {
                productReference: product.reference,
                productAvailability: product.availabilityStatus,
                commercialDataConfirmed: Boolean(
                    product.priceConfirmedAt &&
                    (product.priceFrom !== null || product.fixedPrice !== null)
                ),
                requiresHumanApproval: true,
                autoPublish: false,
                contentFingerprint
            }
        });
    }

    async review(id, input) {
        const item = await this.requireItem(id);
        const product = await this.catalog.getByReference(item.productReference);
        const settings = await this.settings.getSettings();
        const decision = decideContent({
            scores: input.scores,
            productAvailable: Boolean(product && ["AVAILABLE", "LOW_STOCK"].includes(product.availabilityStatus)),
            commercialDataConfirmed: Boolean(item.metadata.commercialDataConfirmed),
            privacyRisk: input.privacyRisk,
            copyrightRisk: input.copyrightRisk,
            trademarkRisk: input.trademarkRisk,
            hasThirdPartyWatermark: input.hasThirdPartyWatermark,
            isDuplicate: input.isDuplicate,
            templateApproved: input.templateApproved,
            newTrend: input.newTrend,
            ownedOrLicensedMedia: input.ownedOrLicensedMedia
        }, settings);
        const reviews = REVIEW_TYPES.map(type => ({
            reviewType: DB_REVIEW_NAMES[type],
            score: input.scores[type],
            passed: input.scores[type] >= settings.thresholds.humanApproval,
            findings: input.findings?.[type] || [],
            attempt: input.attempt || 1,
            model: input.model || null
        }));
        await this.repository.replaceReviews(id, reviews);
        const updated = await this.repository.update(id, {
            status: decision.decision,
            overallScore: decision.overallScore,
            reviewPasses: reviews.filter(review => review.passed).length,
            humanApprovalRequired: true,
            metadata: { ...item.metadata, decisionReasons: decision.reasons }
        });
        return { item: updated, decision, reviews };
    }

    async approve(id, context = {}) {
        const item = await this.requireItem(id);
        if (item.status !== "REQUIRES_HUMAN_APPROVAL") {
            throw Object.assign(new Error("El contenido debe superar las revisiones antes de aprobarse."), {
                statusCode: 409,
                code: "CONTENT_NOT_READY_FOR_APPROVAL"
            });
        }
        const product = await this.catalog.getByReference(item.productReference);
        if (!product || !["AVAILABLE", "LOW_STOCK"].includes(product.availabilityStatus)) {
            throw Object.assign(new Error("El producto dejó de estar disponible."), {
                statusCode: 409,
                code: "PRODUCT_UNAVAILABLE"
            });
        }
        const updated = await this.repository.update(id, {
            status: "APPROVED",
            approvedAt: new Date().toISOString(),
            humanApprovalRequired: false,
            metadata: { ...item.metadata, manuallyApproved: true, autoPublish: false }
        });
        await this.repository.audit({
            actorType: "admin-api",
            action: "CONTENT_APPROVED",
            entityType: "content_item",
            entityId: id,
            beforeData: { status: item.status },
            afterData: { status: updated.status },
            requestId: context.requestId || null
        });
        return updated;
    }

    async reject(id, reason, context = {}) {
        const item = await this.requireItem(id);
        const updated = await this.repository.update(id, {
            status: "REJECTED",
            humanApprovalRequired: false,
            metadata: { ...item.metadata, rejectionReason: reason, autoPublish: false }
        });
        await this.repository.audit({
            actorType: "admin-api",
            action: "CONTENT_REJECTED",
            entityType: "content_item",
            entityId: id,
            beforeData: { status: item.status },
            afterData: { status: updated.status, reason },
            requestId: context.requestId || null
        });
        return updated;
    }

    async requireItem(id) {
        const item = await this.repository.get(id);
        if (!item) {
            throw Object.assign(new Error("Contenido no encontrado."), {
                statusCode: 404,
                code: "CONTENT_NOT_FOUND"
            });
        }
        return item;
    }
}

module.exports = {
    ContentLifecycleService,
    DB_REVIEW_NAMES
};
