const { createContentRepository } = require("../repositories/contentRepository");
const { ContentSettingsService } = require("./contentSettingsService");

const HUMAN_ONLY_REVIEWS = new Set(["visual", "privacy", "originality", "technical"]);
const HUMAN_ONLY_REASONS = new Set([
    "PRODUCT_UNAVAILABLE",
    "COMMERCIAL_DATA_UNCONFIRMED",
    "PRIVACY_RISK",
    "COPYRIGHT_RISK",
    "TRADEMARK_RISK",
    "THIRD_PARTY_WATERMARK",
    "DUPLICATE_CONTENT"
]);

function normalizeCopy(value) {
    if (value === null || value === undefined) return value;
    return String(value)
        .replace(/[ \t]+/g, " ")
        .replace(/\s+([,.;:!?])/g, "$1")
        .replace(/([,.;:!?])([^\s\n])/g, "$1 $2")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

class ContentCorrectionService {
    constructor(options = {}) {
        this.repository = options.repository || createContentRepository();
        this.settings = options.settings || new ContentSettingsService();
    }

    async correct(contentId) {
        const item = await this.repository.get(contentId);
        if (!item) {
            throw Object.assign(new Error("Contenido no encontrado."), {
                statusCode: 404,
                code: "CONTENT_NOT_FOUND"
            });
        }
        if (item.status !== "NEEDS_CORRECTION") {
            throw Object.assign(new Error("El contenido no está esperando corrección."), {
                statusCode: 409,
                code: "CONTENT_NOT_WAITING_CORRECTION"
            });
        }
        const settings = await this.settings.getSettings();
        const attempt = Number(item.metadata?.correctionAttempt || 0) + 1;
        const reviews = await this.repository.getReviews(contentId);
        const failed = reviews.filter(review => review.passed === false);
        const review = failed[0];
        if (!review?.id) {
            throw Object.assign(new Error("No existe una revisión fallida para corregir."), {
                statusCode: 409,
                code: "FAILED_REVIEW_REQUIRED"
            });
        }
        const failedTypes = failed.map(entry => entry.review_type || entry.reviewType);
        const reasons = item.metadata?.decisionReasons || [];
        const humanOnly = attempt > settings.maxCorrectionAttempts ||
            failedTypes.some(type => HUMAN_ONLY_REVIEWS.has(type)) ||
            reasons.some(reason => HUMAN_ONLY_REASONS.has(reason));
        if (humanOnly) {
            await this.repository.recordCorrection({
                reviewId: review.id,
                correctionType: "human_required",
                attempt,
                beforeSnapshot: { status: item.status, failedTypes, reasons },
                afterSnapshot: null,
                status: "HUMAN_REQUIRED",
                errorMessage: attempt > settings.maxCorrectionAttempts
                    ? "Se alcanzó el límite de intentos automáticos."
                    : "El fallo requiere criterio humano o un archivo nuevo."
            });
            return {
                status: "HUMAN_REQUIRED",
                contentId,
                attempt,
                corrected: false,
                failedTypes,
                reasons
            };
        }
        const before = {
            title: item.title,
            primaryText: item.primaryText,
            callToAction: item.callToAction,
            hashtags: item.hashtags
        };
        const after = {
            title: normalizeCopy(item.title),
            primaryText: normalizeCopy(item.primaryText),
            callToAction: normalizeCopy(item.callToAction),
            hashtags: (item.hashtags || []).map(tag => normalizeCopy(tag)).filter(Boolean)
        };
        const changed = JSON.stringify(before) !== JSON.stringify(after);
        if (!changed) {
            await this.repository.recordCorrection({
                reviewId: review.id,
                correctionType: "human_required",
                attempt,
                beforeSnapshot: before,
                afterSnapshot: null,
                status: "HUMAN_REQUIRED",
                errorMessage: "No existe una corrección determinista segura para los hallazgos."
            });
            return {
                status: "HUMAN_REQUIRED",
                contentId,
                attempt,
                corrected: false,
                failedTypes
            };
        }
        const updated = await this.repository.update(contentId, {
            ...after,
            status: "UNDER_REVIEW",
            humanApprovalRequired: true,
            metadata: {
                ...item.metadata,
                correctionAttempt: attempt,
                correctionTypes: failedTypes,
                autoPublish: false
            }
        });
        await this.repository.recordCorrection({
            reviewId: review.id,
            correctionType: "safe_copy_normalization",
            attempt,
            beforeSnapshot: before,
            afterSnapshot: after,
            status: "APPLIED"
        });
        return {
            status: "CORRECTED_REVIEW_REQUIRED",
            contentId,
            attempt,
            corrected: true,
            item: updated,
            autoPublish: false
        };
    }
}

module.exports = {
    ContentCorrectionService,
    normalizeCopy,
    HUMAN_ONLY_REVIEWS
};
