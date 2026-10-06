const crypto = require("crypto");
const path = require("path");
const { JsonDocumentStore } = require("./jsonDocumentStore");
const {
    getSupabaseAdminClient,
    hasSupabaseConfiguration
} = require("../db/supabaseClient");

function mapMetric(row) {
    if (!row) return null;
    const published = row.published_content;
    const variant = published?.content_variants;
    const item = variant?.content_items;
    const basis = Number(row.reach) > 0 ? "reach" : Number(row.impressions) > 0 ? "impressions" : Number(row.views) > 0 ? "views" : null;
    return {
        id: row.id,
        publishedContentId: row.published_content_id || row.publishedContentId,
        capturedAt: row.captured_at || row.capturedAt,
        platform: row.published_content?.platform || row.platform || null,
        views: Number(row.views || 0),
        impressions: Number(row.impressions || 0),
        engagementBasis: basis,
        engagementRate: basis ? ["likes", "comments", "shares", "saves"].reduce((sum, name) => sum + Number(row[name] || 0), 0) / Number(row[basis]) * 100 : null,
        isSimulated: row.published_content?.is_simulated || row.isSimulated || false,
        publicationContext: item ? {
            platform: published.platform, publishedAt: published.published_at, format: variant.format,
            productReference: item.products?.reference || item.metadata?.productReference,
            hook: variant.title || item.metadata?.hook, topic: item.category,
            durationMs: item.metadata?.durationMs, callToAction: item.call_to_action
        } : row.publicationContext || row.raw_metrics?.publicationContext || row.rawMetrics?.publicationContext || {},
        reach: Number(row.reach || 0),
        watchTimeMs: Number(row.watch_time_ms ?? row.watchTimeMs ?? 0),
        averageRetention: Number(row.average_retention ?? row.averageRetention ?? 0),
        likes: Number(row.likes || 0),
        comments: Number(row.comments || 0),
        shares: Number(row.shares || 0),
        saves: Number(row.saves || 0),
        profileVisits: Number(row.profile_visits ?? row.profileVisits ?? 0),
        clicks: Number(row.clicks || 0),
        messages: Number(row.messages || 0),
        quoteRequests: Number(row.quote_requests ?? row.quoteRequests ?? 0),
        sales: Number(row.sales || 0),
        revenue: Number(row.revenue || 0),
        rawMetrics: row.raw_metrics || row.rawMetrics || {}
    };
}

class FileMetricsRepository {
    constructor(filePath = path.resolve(
        process.env.CONTENT_ENGINE_WORK_DIR || "./storage/work",
        "social-metrics.json"
    )) {
        this.store = new JsonDocumentStore(filePath, { metrics: [] });
    }

    async upsert(input) {
        let saved;
        await this.store.update(document => {
            document.metrics ||= [];
            const index = document.metrics.findIndex(metric => (
                metric.publishedContentId === input.publishedContentId &&
                metric.capturedAt === input.capturedAt
            ));
            if (index >= 0) {
                document.metrics[index] = { ...document.metrics[index], ...input };
                saved = document.metrics[index];
            } else {
                saved = { id: crypto.randomUUID(), ...input };
                document.metrics.push(saved);
            }
        });
        return mapMetric(saved);
    }

    async listRecent(limit = 500) {
        const document = await this.store.read();
        return (document.metrics || []).map(mapMetric)
            .sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt))
            .slice(0, limit);
    }
}

class SupabaseMetricsRepository {
    constructor(client = getSupabaseAdminClient()) {
        this.client = client;
    }

    async upsert(input) {
        const record = {
            published_content_id: input.publishedContentId,
            captured_at: input.capturedAt,
            views: input.views,
            impressions: input.impressions,
            reach: input.reach,
            watch_time_ms: input.watchTimeMs,
            average_retention: input.averageRetention,
            likes: input.likes,
            comments: input.comments,
            shares: input.shares,
            saves: input.saves,
            profile_visits: input.profileVisits,
            clicks: input.clicks,
            messages: input.messages,
            quote_requests: input.quoteRequests,
            sales: input.sales,
            revenue: input.revenue,
            raw_metrics: input.rawMetrics
        };
        const { data, error } = await this.client.from("social_metrics")
            .upsert(record, { onConflict: "published_content_id,captured_at" })
            .select("*, published_content(platform,is_simulated,published_at,content_variants(format,title,content_items(category,call_to_action,metadata,products(reference))))").single();
        if (error) throw new Error(`No se pudieron guardar métricas: ${error.message}`);
        return mapMetric(data);
    }

    async listRecent(limit = 500) {
        const safeLimit = Math.min(Math.max(Number(limit) || 500, 1), 2000);
        const { data, error } = await this.client.from("social_metrics")
            .select("*, published_content(platform,is_simulated,published_at,content_variants(format,title,content_items(category,call_to_action,metadata,products(reference))))")
            .order("captured_at", { ascending: false }).limit(safeLimit);
        if (error) throw new Error(`No se pudieron consultar métricas: ${error.message}`);
        return (data || []).map(mapMetric);
    }
}

function createMetricsRepository() {
    return hasSupabaseConfiguration()
        ? new SupabaseMetricsRepository()
        : new FileMetricsRepository();
}

module.exports = {
    FileMetricsRepository,
    SupabaseMetricsRepository,
    createMetricsRepository,
    mapMetric
};
