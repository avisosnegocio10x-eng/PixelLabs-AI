const REVIEW_TYPES = Object.freeze([
    "visual",
    "spelling",
    "commercial",
    "brand",
    "originality",
    "privacy",
    "technical",
    "businessPotential"
]);

function calculateOverallScore(scores) {
    const values = REVIEW_TYPES.map(type => scores[type]);

    if (values.some(value => !Number.isFinite(value) || value < 0 || value > 100)) {
        throw Object.assign(new Error("Faltan revisiones obligatorias o contienen valores inválidos."), {
            code: "INCOMPLETE_REVIEWS"
        });
    }

    return Math.round(
        (values.reduce((sum, value) => sum + value, 0) / values.length) * 100
    ) / 100;
}

function decideContent(input, settings) {
    const overallScore = calculateOverallScore(input.scores);
    const hardFailures = [];

    if (!input.productAvailable) hardFailures.push("PRODUCT_UNAVAILABLE");
    if (!input.commercialDataConfirmed) hardFailures.push("COMMERCIAL_DATA_UNCONFIRMED");
    if (input.privacyRisk) hardFailures.push("PRIVACY_RISK");
    if (input.copyrightRisk >= 50) hardFailures.push("COPYRIGHT_RISK");
    if (input.trademarkRisk >= 50) hardFailures.push("TRADEMARK_RISK");
    if (input.hasThirdPartyWatermark) hardFailures.push("THIRD_PARTY_WATERMARK");
    if (input.isDuplicate) hardFailures.push("DUPLICATE_CONTENT");

    if (hardFailures.length > 0) {
        return {
            overallScore,
            decision: "NEEDS_CORRECTION",
            eligibleForAutomaticPublishing: false,
            reasons: hardFailures
        };
    }

    if (overallScore < settings.thresholds.humanApproval) {
        return {
            overallScore,
            decision: "NEEDS_CORRECTION",
            eligibleForAutomaticPublishing: false,
            reasons: ["SCORE_BELOW_HUMAN_THRESHOLD"]
        };
    }

    const automaticConditions = [
        settings.enabled,
        settings.autoPublish,
        settings.approvalMode !== "manual",
        overallScore >= settings.thresholds.automaticApproval,
        input.templateApproved,
        !input.newTrend,
        input.ownedOrLicensedMedia
    ];

    if (automaticConditions.every(Boolean)) {
        return {
            overallScore,
            decision: "APPROVED_AUTOMATICALLY",
            eligibleForAutomaticPublishing: true,
            reasons: []
        };
    }

    return {
        overallScore,
        decision: "REQUIRES_HUMAN_APPROVAL",
        eligibleForAutomaticPublishing: false,
        reasons: input.newTrend
            ? ["NEW_TREND_REQUIRES_HUMAN_APPROVAL"]
            : ["AUTOMATIC_APPROVAL_CONDITIONS_NOT_MET"]
    };
}

function assertCanPublish({ decision, settings, platform, productAvailable }) {
    const reasons = [];

    if (!settings.enabled) reasons.push("ENGINE_STOPPED");
    if (!settings.autoPublish) reasons.push("AUTO_PUBLISH_DISABLED");
    if (!settings.platformAutomation[platform]) reasons.push("PLATFORM_DISABLED");
    if (!productAvailable) reasons.push("PRODUCT_UNAVAILABLE");
    if (decision.decision !== "APPROVED_AUTOMATICALLY") reasons.push("CONTENT_NOT_AUTO_APPROVED");
    if (!decision.eligibleForAutomaticPublishing) reasons.push("CONTENT_NOT_ELIGIBLE");

    if (reasons.length > 0) {
        throw Object.assign(new Error("La publicación fue bloqueada por las reglas de seguridad."), {
            statusCode: 409,
            code: "PUBLICATION_BLOCKED",
            reasons
        });
    }

    return true;
}

module.exports = {
    REVIEW_TYPES,
    calculateOverallScore,
    decideContent,
    assertCanPublish
};
