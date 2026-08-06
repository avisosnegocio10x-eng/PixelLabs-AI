const crypto = require("crypto");
const path = require("path");
const {
    getSupabaseAdminClient,
    hasSupabaseConfiguration
} = require("../db/supabaseClient");
const { JsonDocumentStore } = require("./jsonDocumentStore");

function fingerprint(input) {
    return crypto.createHash("sha256")
        .update(JSON.stringify(input))
        .digest("hex");
}

function mapContentItem(row) {
    if (!row) return null;
    return {
        id: row.id,
        productId: row.product_id || row.productId || null,
        productReference: row.metadata?.productReference || row.productReference || null,
        objective: row.objective,
        audience: row.audience || null,
        category: row.category,
        format: row.format,
        title: row.title || null,
        primaryText: row.primary_text || row.primaryText || null,
        callToAction: row.call_to_action || row.callToAction || null,
        hashtags: row.hashtags || [],
        platforms: row.metadata?.platforms || row.platforms || [],
        status: row.status,
        overallScore: row.overall_score ?? row.overallScore ?? null,
        reviewPasses: row.review_passes ?? row.reviewPasses ?? 0,
        humanApprovalRequired: row.human_approval_required ?? row.humanApprovalRequired ?? true,
        approvedAt: row.approved_at || row.approvedAt || null,
        metadata: row.metadata || {},
        createdAt: row.created_at || row.createdAt,
        updatedAt: row.updated_at || row.updatedAt
    };
}

class FileContentRepository {
    constructor(filePath = path.resolve(
        process.env.CONTENT_ENGINE_WORK_DIR || "./storage/work",
        "content-library.json"
    )) {
        this.store = new JsonDocumentStore(filePath, {
            contentItems: [],
            reviews: [],
            auditLogs: []
        });
    }

    async createDraft(input) {
        const now = new Date().toISOString();
        const item = mapContentItem({
            id: crypto.randomUUID(),
            ...input,
            status: "DRAFT",
            overallScore: null,
            reviewPasses: 0,
            humanApprovalRequired: true,
            createdAt: now,
            updatedAt: now
        });
        await this.store.update(document => {
            const duplicate = document.contentItems.find(existing => (
                existing.metadata?.contentFingerprint === input.metadata.contentFingerprint
            ));
            if (duplicate) {
                throw Object.assign(new Error("El contenido ya existe."), {
                    statusCode: 409,
                    code: "DUPLICATE_CONTENT"
                });
            }
            document.contentItems.push(item);
        });
        return item;
    }

    async list(filters = {}) {
        const document = await this.store.read();
        const limit = Math.min(Math.max(Number(filters.limit) || 100, 1), 250);
        return document.contentItems
            .map(mapContentItem)
            .filter(item => !filters.status || item.status === filters.status)
            .filter(item => !filters.productReference || item.productReference === filters.productReference)
            .slice(0, limit);
    }

    async get(id) {
        const document = await this.store.read();
        return mapContentItem(document.contentItems.find(item => item.id === id));
    }

    async update(id, changes) {
        let updated = null;
        await this.store.update(document => {
            const index = document.contentItems.findIndex(item => item.id === id);
            if (index < 0) return;
            document.contentItems[index] = {
                ...document.contentItems[index],
                ...changes,
                updatedAt: new Date().toISOString()
            };
            updated = mapContentItem(document.contentItems[index]);
        });
        return updated;
    }

    async replaceReviews(contentItemId, reviews) {
        await this.store.update(document => {
            document.reviews = document.reviews.filter(review => review.contentItemId !== contentItemId);
            document.reviews.push(...reviews.map(review => ({
                id: crypto.randomUUID(),
                contentItemId,
                ...review,
                reviewedAt: new Date().toISOString()
            })));
        });
        return reviews;
    }

    async getReviews(contentItemId) {
        const document = await this.store.read();
        return document.reviews.filter(review => review.contentItemId === contentItemId);
    }

    async audit(entry) {
        await this.store.update(document => {
            document.auditLogs.push({
                id: crypto.randomUUID(),
                ...entry,
                createdAt: new Date().toISOString()
            });
        });
    }
}

class SupabaseContentRepository {
    constructor(client = getSupabaseAdminClient()) {
        this.client = client;
    }

    async createDraft(input) {
        const record = {
            product_id: input.productId || null,
            objective: input.objective,
            audience: input.audience || null,
            category: input.category,
            format: input.format,
            title: input.title || null,
            primary_text: input.primaryText || null,
            call_to_action: input.callToAction || null,
            hashtags: input.hashtags || [],
            status: "DRAFT",
            content_fingerprint: input.metadata.contentFingerprint,
            human_approval_required: true,
            metadata: input.metadata
        };
        const { data, error } = await this.client.from("content_items")
            .insert(record).select("*").single();
        if (error) {
            if (error.code === "23505") {
                throw Object.assign(new Error("El contenido ya existe."), {
                    statusCode: 409,
                    code: "DUPLICATE_CONTENT"
                });
            }
            throw new Error(`No se pudo crear el borrador: ${error.message}`);
        }
        return mapContentItem(data);
    }

    async list(filters = {}) {
        const limit = Math.min(Math.max(Number(filters.limit) || 100, 1), 250);
        let query = this.client.from("content_items").select("*")
            .order("created_at", { ascending: false }).limit(limit);
        if (filters.status) query = query.eq("status", filters.status);
        if (filters.productReference) {
            query = query.contains("metadata", { productReference: filters.productReference });
        }
        const { data, error } = await query;
        if (error) throw new Error(`No se pudo consultar el contenido: ${error.message}`);
        return (data || []).map(mapContentItem);
    }

    async get(id) {
        const { data, error } = await this.client.from("content_items")
            .select("*").eq("id", id).maybeSingle();
        if (error) throw new Error(`No se pudo leer el contenido: ${error.message}`);
        return mapContentItem(data);
    }

    async update(id, changes) {
        const mapping = {
            productId: "product_id",
            primaryText: "primary_text",
            callToAction: "call_to_action",
            overallScore: "overall_score",
            reviewPasses: "review_passes",
            humanApprovalRequired: "human_approval_required",
            approvedAt: "approved_at"
        };
        const update = {};
        for (const [key, value] of Object.entries(changes)) update[mapping[key] || key] = value;
        const { data, error } = await this.client.from("content_items")
            .update(update).eq("id", id).select("*").maybeSingle();
        if (error) throw new Error(`No se pudo actualizar el contenido: ${error.message}`);
        return mapContentItem(data);
    }

    async replaceReviews(contentItemId, reviews) {
        const { error: deleteError } = await this.client.from("content_reviews")
            .delete().eq("content_item_id", contentItemId);
        if (deleteError) throw new Error(`No se pudieron reemplazar revisiones: ${deleteError.message}`);
        const records = reviews.map(review => ({
            content_item_id: contentItemId,
            review_type: review.reviewType,
            attempt: review.attempt || 1,
            score: review.score,
            passed: review.passed,
            findings: review.findings || [],
            model: review.model || null
        }));
        const { data, error } = await this.client.from("content_reviews").insert(records).select("*");
        if (error) throw new Error(`No se pudieron guardar revisiones: ${error.message}`);
        return data;
    }

    async getReviews(contentItemId) {
        const { data, error } = await this.client.from("content_reviews")
            .select("*").eq("content_item_id", contentItemId).order("reviewed_at");
        if (error) throw new Error(`No se pudieron leer revisiones: ${error.message}`);
        return data || [];
    }

    async audit(entry) {
        const { error } = await this.client.from("audit_logs").insert({
            actor_type: entry.actorType || "admin-api",
            action: entry.action,
            entity_type: entry.entityType,
            entity_id: entry.entityId,
            before_data: entry.beforeData || null,
            after_data: entry.afterData || null,
            request_id: entry.requestId || null
        });
        if (error) throw new Error(`No se pudo guardar auditoría: ${error.message}`);
    }
}

function createContentRepository() {
    return hasSupabaseConfiguration()
        ? new SupabaseContentRepository()
        : new FileContentRepository();
}

module.exports = {
    FileContentRepository,
    SupabaseContentRepository,
    createContentRepository,
    fingerprint,
    mapContentItem
};
