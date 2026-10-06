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

function approvalFingerprint(item) {
    return fingerprint({
        productReference: item.productReference, format: item.format, title: item.title,
        primaryText: item.primaryText, callToAction: item.callToAction, hashtags: item.hashtags,
        platforms: item.platforms, mediaAssetIds: item.metadata.mediaAssetIds || [],
        mediaFingerprint: item.metadata.mediaFingerprint || null,
        platformCopies: item.metadata.platformCopies || {},
        productSnapshot: item.metadata.verifiedProductFingerprint || null
    });
}

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
                ...(input.metadata || {}),
                platforms: [...input.platforms],
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
        if (["REJECTED", "ARCHIVED", "PUBLISHED", "SCHEDULED"].includes(item.status)) {
            throw Object.assign(new Error("CONTENT_NOT_REVIEWABLE"), { code: "CONTENT_NOT_REVIEWABLE", statusCode: 409 });
        }
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
        }, { ...settings, autoPublish: false, approvalMode: "manual" });
        const reviewAttempt = Math.max(input.attempt || 1, Number(item.metadata.reviewAttempt || 0) + 1);
        const reviews = REVIEW_TYPES.map(type => ({
            reviewType: DB_REVIEW_NAMES[type],
            score: input.scores[type],
            passed: input.scores[type] >= settings.thresholds.humanApproval,
            findings: input.findings?.[type] || [],
            attempt: reviewAttempt,
            model: input.model || null
        }));
        await this.repository.replaceReviews(id, reviews);
        const updated = await this.repository.compareAndUpdate(item, {
            status: decision.decision,
            overallScore: decision.overallScore,
            reviewPasses: reviews.filter(review => review.passed).length,
            humanApprovalRequired: true,
            approvedAt: null,
            metadata: { ...item.metadata, manuallyApproved: false, approvalFingerprint: null, decisionReasons: decision.reasons, reviewAttempt }
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
        const updated = await this.repository.compareAndUpdate(item, {
            status: "APPROVED",
            approvedAt: new Date().toISOString(),
            humanApprovalRequired: false,
            metadata: { ...item.metadata, manuallyApproved: true, approvalFingerprint: approvalFingerprint(item), autoPublish: false }
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
        const updated = await this.repository.compareAndUpdate(item, {
            status: "REJECTED",
            humanApprovalRequired: false,
            approvedAt: null,
            metadata: { ...item.metadata, rejectionReason: reason, manuallyApproved: false, approvalFingerprint: null, autoPublish: false }
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

    async edit(id, changes) {
        const item = await this.requireItem(id);
        if (["PUBLISHED", "ARCHIVED"].includes(item.status)) {
            throw Object.assign(new Error("CONTENT_NOT_EDITABLE"), { code: "CONTENT_NOT_EDITABLE", statusCode: 409 });
        }
        const metadata = { ...item.metadata, manuallyApproved: false, approvalFingerprint: null,
            platformCopies: {}, autoPublish: false };
        if (changes.mediaAssetIds) metadata.mediaAssetIds = changes.mediaAssetIds;
        const { mediaAssetIds, ...copyChanges } = changes;
        const updated = await this.repository.compareAndUpdate(item, {
            ...copyChanges, status: "DRAFT", approvedAt: null,
            reviewPasses: 0, overallScore: null, humanApprovalRequired: true, metadata
        });
        await this.repository.audit({ actorType: "admin-api", action: "CONTENT_EDITED_APPROVAL_INVALIDATED",
            entityType: "content_item", entityId: id, beforeData: { status: item.status }, afterData: { status: "DRAFT" } });
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
    DB_REVIEW_NAMES,
    approvalFingerprint
};
