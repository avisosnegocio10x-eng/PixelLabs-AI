const { createMetricsRepository } = require("../repositories/metricsRepository");

const INTEGER_FIELDS = Object.freeze([
    "views", "reach", "watchTimeMs", "likes", "comments", "shares", "saves",
    "profileVisits", "clicks", "messages", "quoteRequests", "sales"
]);

function nonNegative(value, field, integer = true) {
    const number = Number(value ?? 0);
    if (!Number.isFinite(number) || number < 0 || (integer && !Number.isInteger(number))) {
        throw Object.assign(new Error(`Métrica inválida: ${field}.`), {
            statusCode: 422,
            code: "INVALID_SOCIAL_METRIC"
        });
    }
    return number;
}

function normalizeMetric(input) {
    if (!/^[0-9a-f-]{36}$/i.test(String(input.publishedContentId || ""))) {
        throw Object.assign(new Error("publishedContentId inválido."), {
            statusCode: 422,
            code: "INVALID_PUBLISHED_CONTENT_ID"
        });
    }
    const capturedAt = input.capturedAt || new Date().toISOString();
    if (Number.isNaN(Date.parse(capturedAt))) {
        throw Object.assign(new Error("capturedAt inválido."), {
            statusCode: 422,
            code: "INVALID_METRIC_TIMESTAMP"
        });
    }
    const metric = {
        publishedContentId: input.publishedContentId,
        capturedAt: new Date(capturedAt).toISOString(),
        platform: ["facebook", "instagram", "tiktok"].includes(input.platform)
            ? input.platform
            : null,
        averageRetention: nonNegative(input.averageRetention, "averageRetention", false),
        revenue: nonNegative(input.revenue, "revenue", false),
        rawMetrics: input.rawMetrics && typeof input.rawMetrics === "object"
            ? input.rawMetrics
            : {}
    };
    if (metric.averageRetention > 100) {
        throw Object.assign(new Error("averageRetention debe estar entre 0 y 100."), {
            statusCode: 422,
            code: "INVALID_SOCIAL_METRIC"
        });
    }
    for (const field of INTEGER_FIELDS) metric[field] = nonNegative(input[field], field);
    return metric;
}

function conversionScore(metric) {
    return (
        metric.revenue * 1000 + metric.sales * 200 + metric.quoteRequests * 50 +
        metric.messages * 15 + metric.clicks * 2 + metric.profileVisits +
        metric.saves * 0.5 + metric.shares * 0.5 + metric.views * 0.001
    );
}

class MetricsService {
    constructor(options = {}) {
        this.repository = options.repository || createMetricsRepository();
    }

    async recordBatch(items = []) {
        if (!Array.isArray(items) || items.length === 0 || items.length > 500) {
            throw Object.assign(new Error("Incluye entre 1 y 500 registros de métricas."), {
                statusCode: 422,
                code: "INVALID_METRICS_BATCH"
            });
        }
        const results = [];
        for (const item of items) results.push(await this.repository.upsert(normalizeMetric(item)));
        return results;
    }

    async summary(limit = 1000) {
        const metrics = await this.repository.listRecent(limit);
        const totals = {
            views: 0, reach: 0, watchTimeMs: 0, likes: 0, comments: 0,
            shares: 0, saves: 0, profileVisits: 0, clicks: 0, messages: 0,
            quoteRequests: 0, sales: 0, revenue: 0
        };
        const byPlatform = new Map();
        for (const metric of metrics) {
            for (const field of Object.keys(totals)) totals[field] += Number(metric[field] || 0);
            const platform = metric.platform || "unknown";
            const aggregate = byPlatform.get(platform) || {
                platform, records: 0, views: 0, messages: 0,
                quoteRequests: 0, sales: 0, revenue: 0, conversionScore: 0
            };
            aggregate.records += 1;
            for (const field of ["views", "messages", "quoteRequests", "sales", "revenue"]) {
                aggregate[field] += Number(metric[field] || 0);
            }
            aggregate.conversionScore += conversionScore(metric);
            byPlatform.set(platform, aggregate);
        }
        const platforms = [...byPlatform.values()]
            .sort((a, b) => b.conversionScore - a.conversionScore);
        return {
            records: metrics.length,
            totals,
            platforms,
            bestPlatform: platforms[0]?.platform || null,
            priority: ["revenue", "sales", "quoteRequests", "messages", "views"]
        };
    }

    async weeklyRecommendations() {
        const summary = await this.summary();
        if (!summary.records) {
            return {
                status: "NO_VERIFIED_METRICS",
                automaticSettingsChanged: false,
                recommendations: []
            };
        }
        const recommendations = [];
        if (summary.bestPlatform && summary.bestPlatform !== "unknown") {
            recommendations.push({
                type: "PRIORITIZE_PLATFORM",
                platform: summary.bestPlatform,
                reason: "Mayor valor combinado de ingresos, ventas, cotizaciones y mensajes."
            });
        }
        if (summary.totals.views > 0 && summary.totals.messages === 0) {
            recommendations.push({
                type: "IMPROVE_CALL_TO_ACTION",
                reason: "Hay visualizaciones, pero todavía no se atribuyen mensajes."
            });
        }
        return {
            status: "RECOMMENDATIONS_READY",
            automaticSettingsChanged: false,
            recommendations,
            summary
        };
    }
}

module.exports = {
    MetricsService,
    normalizeMetric,
    conversionScore
};
