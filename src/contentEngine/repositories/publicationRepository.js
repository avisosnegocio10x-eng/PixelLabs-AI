const crypto = require("crypto");
const path = require("path");
const { JsonDocumentStore } = require("./jsonDocumentStore");
const { getSupabaseAdminClient, hasSupabaseConfiguration } = require("../db/supabaseClient");

function scheduleError(code) { return Object.assign(new Error(code), { code, statusCode: 409, retryable: false }); }
function mapSchedule(row) {
    if (!row) return null;
    return { id: row.id, variantId: row.content_variant_id || row.variantId,
        accountId: row.social_account_id || row.accountId, scheduledFor: row.scheduled_for || row.scheduledFor,
        status: row.status, mode: row.execution_mode || row.mode, approvalFingerprint: row.approval_fingerprint || row.approvalFingerprint,
        idempotencyKey: row.idempotency_key || row.idempotencyKey, leaseExpiresAt: row.lease_expires_at || row.leaseExpiresAt,
        variant: row.content_variants || row.variant };
}

class FilePublicationRepository {
    constructor(filePath = path.resolve(process.env.CONTENT_ENGINE_WORK_DIR || "./storage/work", "publication-calendar.json")) {
        this.store = new JsonDocumentStore(filePath, { accounts: [], schedules: [], published: [], aiRequests: [] });
    }
    async sandboxAccount(platform) {
        let account;
        await this.store.update(doc => {
            account = doc.accounts.find(row => row.platform === platform);
            if (!account) { account = { id: crypto.randomUUID(), platform, mode: "dry-run" }; doc.accounts.push(account); }
        });
        return account;
    }
    async queue(input) {
        let result;
        await this.store.update(doc => {
            const previous = doc.schedules.find(row => row.idempotencyKey === input.idempotencyKey);
            if (previous) { result = previous; return; }
            const active = doc.schedules.filter(row => row.accountId === input.accountId && row.status !== "SKIPPED");
            if (active.filter(row => row.scheduledFor >= input.dayStart && row.scheduledFor < input.dayEnd).length >= input.maxDaily) {
                throw scheduleError("DAILY_PUBLICATION_LIMIT");
            }
            if (active.some(row => Math.abs(Date.parse(row.scheduledFor) - Date.parse(input.scheduledFor)) < input.minGap * 1000)) {
                throw scheduleError("PUBLICATION_INTERVAL_LIMIT");
            }
            result = { id: crypto.randomUUID(), variantId: crypto.randomUUID(), ...input, status: "SCHEDULED", mode: "dry-run" };
            doc.schedules.push(result);
        });
        return result;
    }
    async list() { return (await this.store.read()).schedules; }
    async claim(now) {
        let result = null;
        await this.store.update(doc => {
            const candidate = doc.schedules.filter(row => row.mode === "dry-run" && row.scheduledFor <= now &&
                (row.status === "SCHEDULED" || (row.status === "PUBLISHING" && row.leaseExpiresAt < now)))
                .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))[0];
            if (!candidate) return;
            candidate.status = "PUBLISHING";
            candidate.leaseExpiresAt = new Date(Date.parse(now) + 120000).toISOString();
            result = { ...candidate };
        });
        return result;
    }
    async skip(id) {
        await this.store.update(doc => { const item = doc.schedules.find(row => row.id === id); if (item) item.status = "SKIPPED"; });
    }
    async finish(schedule, now) {
        let result;
        await this.store.update(doc => {
            const item = doc.schedules.find(row => row.id === schedule.id);
            if (item?.status !== "PUBLISHING") throw scheduleError("SCHEDULE_NOT_CLAIMED");
            result = doc.published.find(row => row.scheduleId === schedule.id);
            if (!result) {
                result = { id: crypto.randomUUID(), scheduleId: schedule.id, platform: schedule.platform,
                    externalId: `dry-run:${schedule.id}`, isSimulated: true, publishedAt: now, externalRequestsSent: 0 };
                doc.published.push(result);
            }
            item.status = "PUBLISHED";
            item.leaseExpiresAt = null;
        });
        return result;
    }
    async reserve(purpose, limit) {
        const day = new Date().toISOString().slice(0, 10);
        await this.store.update(doc => {
            doc.aiRequests ||= [];
            if (doc.aiRequests.filter(row => row.day === day).length >= limit) throw scheduleError("GEMINI_DAILY_REQUEST_LIMIT");
            doc.aiRequests.push({ id: crypto.randomUUID(), day, purpose });
            doc.aiRequests = doc.aiRequests.filter(row => row.day >= day);
        });
    }
}

class SupabasePublicationRepository {
    constructor(client = getSupabaseAdminClient()) { this.client = client; }
    async rpc(name, args) {
        const { data, error } = await this.client.rpc(name, args);
        if (error) {
            const safe = /^[A-Z_]+$/.test(error.message) ? error.message : "PUBLICATION_DATABASE_NOT_READY";
            throw scheduleError(safe);
        }
        return data;
    }
    async sandboxAccount(platform) {
        const { data, error } = await this.client.from("social_accounts").upsert({
            platform, external_account_id: `dry-run:${platform}`, display_name: `Simulación ${platform}`,
            status: "DISCONNECTED", automation_enabled: false, metadata: { mode: "dry-run" }
        }, { onConflict: "platform,external_account_id" }).select("id,platform").single();
        if (error) throw scheduleError("SANDBOX_ACCOUNT_UNAVAILABLE");
        return data;
    }
    async queue(input) {
        return mapSchedule(await this.rpc("content_queue_dry_run", {
            p_content_id: input.contentId, p_account_id: input.accountId, p_platform: input.platform,
            p_scheduled_for: input.scheduledFor, p_format: input.variant.format, p_caption: input.variant.caption,
            p_title: input.variant.title, p_hashtags: input.variant.hashtags, p_media_ids: input.variant.mediaAssetIds,
            p_fingerprint: input.idempotencyKey, p_approval: input.approvalFingerprint, p_max_daily: input.maxDaily,
            p_day_start: input.dayStart, p_day_end: input.dayEnd, p_min_gap: input.minGap
        }));
    }
    async list() {
        const { data, error } = await this.client.from("content_schedule")
            .select("*,content_variants(*)").eq("execution_mode", "dry-run").order("scheduled_for").limit(200);
        if (error) throw scheduleError("PUBLICATION_CALENDAR_UNAVAILABLE");
        return (data || []).map(mapSchedule);
    }
    async claim(now) {
        const schedule = mapSchedule(await this.rpc("content_claim_dry_run", { p_now: now }));
        if (!schedule) return null;
        const { data, error } = await this.client.from("content_variants").select("*").eq("id", schedule.variantId).single();
        if (error) throw scheduleError("PUBLICATION_VARIANT_UNAVAILABLE");
        return { ...schedule, contentId: data.content_item_id, platform: data.platform, variant: data };
    }
    async skip(id) {
        const { error } = await this.client.from("content_schedule").update({ status: "SKIPPED", lease_expires_at: null }).eq("id", id);
        if (error) throw scheduleError("PUBLICATION_SKIP_FAILED");
    }
    async finish(schedule, now) {
        const row = await this.rpc("content_finish_dry_run", { p_schedule_id: schedule.id, p_external_id: `dry-run:${schedule.id}`, p_now: now });
        return { id: row.id, platform: row.platform, externalId: row.external_id, isSimulated: row.is_simulated,
            publishedAt: row.published_at, externalRequestsSent: 0 };
    }
    async reserve(purpose, limit) {
        const allowed = await this.rpc("content_reserve_ai_request", { p_key: crypto.randomUUID(), p_purpose: purpose, p_limit: limit });
        if (!allowed) throw scheduleError("GEMINI_DAILY_REQUEST_LIMIT");
    }
}

function createPublicationRepository() {
    return hasSupabaseConfiguration() ? new SupabasePublicationRepository() : new FilePublicationRepository();
}
module.exports = { FilePublicationRepository, SupabasePublicationRepository, createPublicationRepository, mapSchedule, scheduleError };
