const crypto = require("crypto");
const path = require("path");
const { JsonDocumentStore } = require("./jsonDocumentStore");
const {
    getSupabaseAdminClient,
    hasSupabaseConfiguration
} = require("../db/supabaseClient");

function mapTrend(row, score = null) {
    if (!row) return null;
    return {
        id: row.id,
        sourceId: row.source_id || row.sourceId || null,
        externalKey: row.external_key || row.externalKey || null,
        name: row.name,
        summary: row.summary || null,
        sourceUrl: row.source_url || row.sourceUrl || null,
        region: row.region || null,
        language: row.language || "es",
        status: row.status,
        contentHash: row.content_hash || row.contentHash,
        firstSeenAt: row.first_seen_at || row.firstSeenAt,
        lastSeenAt: row.last_seen_at || row.lastSeenAt,
        expiresAt: row.expires_at || row.expiresAt || null,
        score
    };
}

function mapScore(row) {
    if (!row) return null;
    return {
        id: row.id,
        trendId: row.trend_id || row.trendId,
        relevanceScore: row.relevance_score ?? row.relevanceScore,
        salesPotential: row.sales_potential ?? row.salesPotential,
        messagesPotential: row.messages_potential ?? row.messagesPotential,
        commentsPotential: row.comments_potential ?? row.commentsPotential,
        localInterest: row.local_interest ?? row.localInterest,
        conversionEase: row.conversion_ease ?? row.conversionEase,
        productAvailability: row.product_availability ?? row.productAvailability,
        ownedMediaAvailability: row.owned_media_availability ?? row.ownedMediaAvailability,
        originalityPotential: row.originality_potential ?? row.originalityPotential,
        copyrightRisk: row.copyright_risk ?? row.copyrightRisk,
        trademarkRisk: row.trademark_risk ?? row.trademarkRisk,
        misinformationRisk: row.misinformation_risk ?? row.misinformationRisk,
        productionDifficulty: row.production_difficulty ?? row.productionDifficulty,
        expectedDuration: row.expected_duration ?? row.expectedDuration,
        overallScore: Number(row.overall_score ?? row.overallScore),
        recommendation: row.recommendation,
        recommendedFormats: row.recommended_formats || row.recommendedFormats || [],
        rationale: row.rationale || null,
        scoredAt: row.scored_at || row.scoredAt
    };
}

class FileTrendRepository {
    constructor(filePath = path.resolve(
        process.env.CONTENT_ENGINE_WORK_DIR || "./storage/work",
        "trend-radar.json"
    )) {
        this.store = new JsonDocumentStore(filePath, {
            sources: [],
            trends: [],
            scores: []
        });
    }

    async upsertSource(input) {
        let saved;
        await this.store.update(document => {
            document.sources ||= [];
            const index = document.sources.findIndex(source => (
                source.name === input.name && source.sourceType === input.sourceType
            ));
            if (index >= 0) {
                document.sources[index] = { ...document.sources[index], ...input };
                saved = document.sources[index];
            } else {
                saved = { id: crypto.randomUUID(), ...input };
                document.sources.push(saved);
            }
        });
        return saved;
    }

    async upsertTrend(input) {
        let saved;
        await this.store.update(document => {
            document.trends ||= [];
            const index = document.trends.findIndex(trend => trend.contentHash === input.contentHash);
            if (index >= 0) {
                const current = document.trends[index];
                document.trends[index] = {
                    ...current,
                    ...input,
                    id: current.id,
                    firstSeenAt: current.firstSeenAt,
                    status: current.status === "BLOCKED" ? "BLOCKED" : input.status
                };
                saved = document.trends[index];
            } else {
                saved = { id: crypto.randomUUID(), ...input };
                document.trends.push(saved);
            }
        });
        return mapTrend(saved);
    }

    async recordScore(input) {
        const saved = { id: crypto.randomUUID(), ...input };
        await this.store.update(document => {
            document.scores ||= [];
            document.scores.push(saved);
        });
        return mapScore(saved);
    }

    async listCandidates(filters = {}) {
        const document = await this.store.read();
        const scores = document.scores || [];
        const minimum = Number(filters.minimumScore) || 0;
        const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);
        return (document.trends || []).map(row => {
            const latest = scores.filter(score => score.trendId === row.id)
                .sort((a, b) => Date.parse(b.scoredAt) - Date.parse(a.scoredAt))[0];
            return mapTrend(row, mapScore(latest));
        }).filter(trend => ["CANDIDATE", "SELECTED"].includes(trend.status))
            .filter(trend => trend.score && trend.score.overallScore >= minimum)
            .sort((a, b) => b.score.overallScore - a.score.overallScore)
            .slice(0, limit);
    }
}

class SupabaseTrendRepository {
    constructor(client = getSupabaseAdminClient()) {
        this.client = client;
    }

    async upsertSource(input) {
        const record = {
            name: input.name,
            source_type: input.sourceType,
            url: input.url || null,
            enabled: input.enabled !== false,
            collection_method: input.collectionMethod,
            terms_notes: input.termsNotes || null,
            last_checked_at: input.lastCheckedAt || new Date().toISOString(),
            metadata: input.metadata || {}
        };
        const { data, error } = await this.client.from("trend_sources")
            .upsert(record, { onConflict: "name,source_type" })
            .select("*").single();
        if (error) throw new Error(`No se pudo guardar la fuente: ${error.message}`);
        return { id: data.id, ...input };
    }

    async upsertTrend(input) {
        const { data: existing, error: readError } = await this.client.from("trends")
            .select("*").eq("content_hash", input.contentHash).maybeSingle();
        if (readError) throw new Error(`No se pudo comprobar la tendencia: ${readError.message}`);
        const record = {
            source_id: input.sourceId || null,
            external_key: input.externalKey || null,
            name: input.name,
            summary: input.summary || null,
            source_url: input.sourceUrl || null,
            source_snapshot: input.sourceSnapshot || {},
            region: input.region || null,
            language: input.language || "es",
            last_seen_at: input.lastSeenAt,
            expires_at: input.expiresAt || null,
            status: existing?.status === "BLOCKED" ? "BLOCKED" : input.status,
            content_hash: input.contentHash
        };
        const query = existing
            ? this.client.from("trends").update(record).eq("id", existing.id)
            : this.client.from("trends").insert({ ...record, first_seen_at: input.firstSeenAt });
        const { data, error } = await query.select("*").single();
        if (error) throw new Error(`No se pudo guardar la tendencia: ${error.message}`);
        return mapTrend(data);
    }

    async recordScore(input) {
        const record = {
            trend_id: input.trendId,
            relevance_score: input.relevanceScore,
            sales_potential: input.salesPotential,
            messages_potential: input.messagesPotential,
            comments_potential: input.commentsPotential,
            local_interest: input.localInterest,
            conversion_ease: input.conversionEase,
            product_availability: input.productAvailability,
            owned_media_availability: input.ownedMediaAvailability,
            originality_potential: input.originalityPotential,
            copyright_risk: input.copyrightRisk,
            trademark_risk: input.trademarkRisk,
            misinformation_risk: input.misinformationRisk,
            production_difficulty: input.productionDifficulty,
            expected_duration: input.expectedDuration,
            overall_score: input.overallScore,
            recommendation: input.recommendation,
            recommended_formats: input.recommendedFormats,
            model: input.model || null,
            rationale: input.rationale || null,
            scored_at: input.scoredAt
        };
        const { data, error } = await this.client.from("trend_scores")
            .insert(record).select("*").single();
        if (error) throw new Error(`No se pudo guardar la puntuación: ${error.message}`);
        return mapScore(data);
    }

    async listCandidates(filters = {}) {
        const minimum = Number(filters.minimumScore) || 0;
        const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);
        const { data: trends, error } = await this.client.from("trends")
            .select("*").in("status", ["CANDIDATE", "SELECTED"])
            .order("last_seen_at", { ascending: false }).limit(limit * 3);
        if (error) throw new Error(`No se pudieron consultar tendencias: ${error.message}`);
        if (!trends?.length) return [];
        const { data: scores, error: scoreError } = await this.client.from("trend_scores")
            .select("*").in("trend_id", trends.map(trend => trend.id))
            .order("scored_at", { ascending: false });
        if (scoreError) throw new Error(`No se pudieron consultar puntuaciones: ${scoreError.message}`);
        const latest = new Map();
        for (const row of scores || []) if (!latest.has(row.trend_id)) latest.set(row.trend_id, mapScore(row));
        return trends.map(row => mapTrend(row, latest.get(row.id) || null))
            .filter(trend => trend.score && trend.score.overallScore >= minimum)
            .sort((a, b) => b.score.overallScore - a.score.overallScore)
            .slice(0, limit);
    }
}

function createTrendRepository() {
    return hasSupabaseConfiguration()
        ? new SupabaseTrendRepository()
        : new FileTrendRepository();
}

module.exports = {
    FileTrendRepository,
    SupabaseTrendRepository,
    createTrendRepository,
    mapTrend,
    mapScore
};
