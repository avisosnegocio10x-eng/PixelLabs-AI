const crypto = require("crypto");
const path = require("path");
const { JsonDocumentStore } = require("./jsonDocumentStore");
const {
    getSupabaseAdminClient,
    hasSupabaseConfiguration
} = require("../db/supabaseClient");

function mapIdea(row) {
    if (!row) return null;
    return {
        id: row.id,
        productId: row.product_id || row.productId || null,
        trendId: row.trend_id || row.trendId || null,
        campaignId: row.campaign_id || row.campaignId || null,
        objective: row.objective,
        category: row.category,
        concept: row.concept,
        recommendedFormats: row.recommended_formats || row.recommendedFormats || [],
        recommendationScore: Number(row.recommendation_score ?? row.recommendationScore ?? 0),
        status: row.status,
        platform: row.platform,
        plannedFor: row.planned_for || row.plannedFor,
        planKey: row.plan_key || row.planKey,
        metadata: row.metadata || {},
        createdAt: row.created_at || row.createdAt,
        updatedAt: row.updated_at || row.updatedAt
    };
}

class FileEditorialPlanRepository {
    constructor(filePath = path.resolve(
        process.env.CONTENT_ENGINE_WORK_DIR || "./storage/work",
        "editorial-calendar.json"
    )) {
        this.store = new JsonDocumentStore(filePath, { ideas: [] });
    }

    async listRange(from, to) {
        const document = await this.store.read();
        return (document.ideas || []).map(mapIdea)
            .filter(idea => idea.plannedFor >= from && idea.plannedFor < to)
            .sort((a, b) => Date.parse(a.plannedFor) - Date.parse(b.plannedFor));
    }

    async upsertMany(inputs) {
        const saved = [];
        await this.store.update(document => {
            document.ideas ||= [];
            for (const input of inputs) {
                const duplicate = document.ideas.find(idea => idea.planKey === input.planKey);
                if (duplicate) {
                    saved.push(mapIdea(duplicate));
                    continue;
                }
                const collision = document.ideas.find(idea => (
                    idea.platform === input.platform &&
                    idea.plannedFor === input.plannedFor &&
                    ["PROPOSED", "SELECTED"].includes(idea.status)
                ));
                if (collision) {
                    throw Object.assign(new Error("Ya existe contenido en ese minuto."), {
                        statusCode: 409,
                        code: "EDITORIAL_TIME_COLLISION"
                    });
                }
                const now = new Date().toISOString();
                const row = {
                    id: crypto.randomUUID(),
                    ...input,
                    createdAt: now,
                    updatedAt: now
                };
                document.ideas.push(row);
                saved.push(mapIdea(row));
            }
        });
        return saved;
    }
}

class SupabaseEditorialPlanRepository {
    constructor(client = getSupabaseAdminClient()) {
        this.client = client;
    }

    async listRange(from, to) {
        const { data, error } = await this.client.from("content_ideas")
            .select("*").gte("planned_for", from).lt("planned_for", to)
            .order("planned_for", { ascending: true });
        if (error) throw new Error(`No se pudo leer el calendario: ${error.message}`);
        return (data || []).map(mapIdea);
    }

    async upsertMany(inputs) {
        if (!inputs.length) return [];
        const records = inputs.map(input => ({
            product_id: input.productId || null,
            trend_id: input.trendId || null,
            campaign_id: input.campaignId || null,
            objective: input.objective,
            category: input.category,
            concept: input.concept,
            target_audience: input.targetAudience || null,
            recommended_formats: input.recommendedFormats,
            recommendation_score: input.recommendationScore,
            status: input.status,
            platform: input.platform,
            planned_for: input.plannedFor,
            plan_key: input.planKey,
            metadata: input.metadata
        }));
        const { error } = await this.client.from("content_ideas")
            .upsert(records, { onConflict: "plan_key", ignoreDuplicates: true });
        if (error) {
            if (error.code === "23505") {
                throw Object.assign(new Error("Ya existe contenido en ese minuto."), {
                    statusCode: 409,
                    code: "EDITORIAL_TIME_COLLISION"
                });
            }
            throw new Error(`No se pudo guardar el calendario: ${error.message}`);
        }
        const keys = inputs.map(input => input.planKey);
        const { data, error: readError } = await this.client.from("content_ideas")
            .select("*").in("plan_key", keys).order("planned_for");
        if (readError) throw new Error(`No se pudo verificar el calendario: ${readError.message}`);
        return (data || []).map(mapIdea);
    }
}

function createEditorialPlanRepository() {
    return hasSupabaseConfiguration()
        ? new SupabaseEditorialPlanRepository()
        : new FileEditorialPlanRepository();
}

module.exports = {
    FileEditorialPlanRepository,
    SupabaseEditorialPlanRepository,
    createEditorialPlanRepository,
    mapIdea
};
