const crypto = require("crypto");
const { createTrendRepository } = require("../repositories/trendRepository");
const { ContentSettingsService } = require("./contentSettingsService");

const COLLECTION_METHODS = new Set(["api", "rss", "manual", "first_party"]);
const SIGNAL_DEFAULTS = Object.freeze({
    relevanceScore: 50,
    salesPotential: 50,
    messagesPotential: 50,
    commentsPotential: 50,
    localInterest: 50,
    conversionEase: 50,
    productAvailability: 50,
    ownedMediaAvailability: 50,
    originalityPotential: 50,
    copyrightRisk: 0,
    trademarkRisk: 0,
    misinformationRisk: 0,
    productionDifficulty: 50,
    expectedDuration: 50
});

function clampScore(value, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(0, Math.min(100, Math.round(number)));
}

function cleanText(value, maximum, required = false) {
    const normalized = String(value || "").replace(/\s+/g, " ").trim();
    if (required && normalized.length < 3) {
        throw Object.assign(new Error("La tendencia necesita un nombre válido."), {
            statusCode: 422,
            code: "INVALID_TREND"
        });
    }
    return normalized.slice(0, maximum) || null;
}

function safeUrl(value) {
    if (!value) return null;
    try {
        const url = new URL(String(value));
        if (!["https:", "http:"].includes(url.protocol)) throw new Error("protocol");
        return url.toString().slice(0, 2000);
    } catch {
        throw Object.assign(new Error("La URL de la fuente no es válida."), {
            statusCode: 422,
            code: "INVALID_TREND_SOURCE_URL"
        });
    }
}

function calculateTrendScore(signals) {
    const positive = (
        signals.relevanceScore * 0.15 +
        signals.salesPotential * 0.16 +
        signals.messagesPotential * 0.16 +
        signals.commentsPotential * 0.05 +
        signals.localInterest * 0.11 +
        signals.conversionEase * 0.11 +
        signals.productAvailability * 0.10 +
        signals.ownedMediaAvailability * 0.08 +
        signals.originalityPotential * 0.08
    );
    const riskPenalty = (
        signals.copyrightRisk * 0.18 +
        signals.trademarkRisk * 0.14 +
        signals.misinformationRisk * 0.12 +
        signals.productionDifficulty * 0.04 +
        signals.expectedDuration * 0.02
    );
    return Math.round(Math.max(0, Math.min(100, positive - riskPenalty)) * 100) / 100;
}

class TrendRadarService {
    constructor(options = {}) {
        this.repository = options.repository || createTrendRepository();
        this.settings = options.settings || new ContentSettingsService();
        this.now = options.now || (() => new Date());
    }

    async ingest(observations = []) {
        if (!Array.isArray(observations) || observations.length === 0 || observations.length > 100) {
            throw Object.assign(new Error("Incluye entre 1 y 100 observaciones."), {
                statusCode: 422,
                code: "INVALID_TREND_BATCH"
            });
        }
        const settings = await this.settings.getSettings();
        const results = [];
        for (const observation of observations) {
            const result = await this.ingestOne(observation, settings);
            results.push(result);
        }
        return results;
    }

    async ingestOne(observation, settings) {
        const sourceInput = observation.source || {};
        const collectionMethod = sourceInput.collectionMethod || "manual";
        if (!COLLECTION_METHODS.has(collectionMethod)) {
            throw Object.assign(new Error("Método de recopilación no autorizado."), {
                statusCode: 422,
                code: "UNSUPPORTED_COLLECTION_METHOD"
            });
        }
        const observedAt = this.now().toISOString();
        const name = cleanText(observation.name, 300, true);
        const source = await this.repository.upsertSource({
            name: cleanText(sourceInput.name || "Carga manual del propietario", 200, true),
            sourceType: cleanText(sourceInput.sourceType || collectionMethod, 80, true),
            url: safeUrl(sourceInput.url),
            collectionMethod,
            termsNotes: cleanText(sourceInput.termsNotes, 1000),
            lastCheckedAt: observedAt,
            enabled: true,
            metadata: { authorized: true }
        });
        const signals = {};
        for (const [key, fallback] of Object.entries(SIGNAL_DEFAULTS)) {
            signals[key] = clampScore(observation.signals?.[key], fallback);
        }
        const overallScore = calculateTrendScore(signals);
        const hardRisk = Math.max(
            signals.copyrightRisk,
            signals.trademarkRisk,
            signals.misinformationRisk
        ) >= 70;
        const recommendation = hardRisk
            ? "reject"
            : overallScore >= settings.minimumTrendScore
                ? "create"
                : overallScore >= Math.max(0, settings.minimumTrendScore - 15)
                    ? "review"
                    : "reject";
        const sourceUrl = safeUrl(observation.sourceUrl || sourceInput.url);
        const contentHash = crypto.createHash("sha256").update(JSON.stringify({
            name: name.toLocaleLowerCase("es"),
            source: source.name,
            externalKey: cleanText(observation.externalKey, 300),
            sourceUrl
        })).digest("hex");
        const trend = await this.repository.upsertTrend({
            sourceId: source.id,
            externalKey: cleanText(observation.externalKey, 300),
            name,
            summary: cleanText(observation.summary, 1000),
            sourceUrl,
            sourceSnapshot: {
                observedAt,
                signals,
                sourceType: source.sourceType
            },
            region: cleanText(observation.region || "SV", 50),
            language: cleanText(observation.language || "es", 10),
            firstSeenAt: observedAt,
            lastSeenAt: observedAt,
            expiresAt: observation.expiresAt || null,
            status: recommendation === "reject" ? "REJECTED" : "CANDIDATE",
            contentHash
        });
        const score = await this.repository.recordScore({
            trendId: trend.id,
            ...signals,
            overallScore,
            recommendation,
            recommendedFormats: Array.isArray(observation.recommendedFormats)
                ? observation.recommendedFormats.slice(0, 10).map(value => cleanText(value, 80, true))
                : ["post", "reel"],
            model: "deterministic-v1",
            rationale: hardRisk
                ? "Riesgo legal o de desinformación demasiado alto."
                : `Puntaje comercial y de relevancia: ${overallScore}.`,
            scoredAt: observedAt
        });
        return { ...trend, score, requiresHumanApproval: true };
    }

    async listCandidates(filters = {}) {
        const settings = await this.settings.getSettings();
        return this.repository.listCandidates({
            minimumScore: filters.minimumScore ?? settings.minimumTrendScore,
            limit: filters.limit
        });
    }
}

module.exports = {
    TrendRadarService,
    calculateTrendScore,
    SIGNAL_DEFAULTS
};
