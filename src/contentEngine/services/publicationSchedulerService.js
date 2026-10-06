const { createPublicationRepository, scheduleError } = require("../repositories/publicationRepository");
const { ContentLifecycleService, approvalFingerprint } = require("./contentLifecycleService");
const { createMediaAssetRepository } = require("../repositories/mediaAssetRepository");
const { fingerprint } = require("../repositories/contentRepository");
const { createPlatformVariant } = require("../social/platformVariantService");
const { localTimeToIso } = require("./editorialPlannerService");

class PublicationSchedulerService {
    constructor(options = {}) {
        this.repository = options.publications || createPublicationRepository();
        this.lifecycle = options.lifecycle || new ContentLifecycleService();
        this.media = options.media || createMediaAssetRepository();
        this.now = options.now || (() => new Date());
    }
    async validate(id, expectedApproval) {
        const settings = await this.lifecycle.settings.getSettings();
        if (!settings.enabled) throw scheduleError("ENGINE_STOPPED");
        const item = await this.lifecycle.requireItem(id);
        if (item.status !== "APPROVED" || !item.approvedAt || item.metadata.manuallyApproved !== true ||
            item.metadata.approvalFingerprint !== approvalFingerprint(item) ||
            (expectedApproval && item.metadata.approvalFingerprint !== expectedApproval)) {
            throw scheduleError("CONTENT_NOT_MANUALLY_APPROVED");
        }
        const product = await this.lifecycle.catalog.getByReference(item.productReference);
        if (!product || !["AVAILABLE", "LOW_STOCK"].includes(product.availabilityStatus)) throw scheduleError("PRODUCT_UNAVAILABLE");
        if (product.promotionBlockedUntil && Date.parse(product.promotionBlockedUntil) > this.now().getTime()) throw scheduleError("PRODUCT_PROMOTION_BLOCKED");
        if (item.metadata.verifiedProductFingerprint && item.metadata.verifiedProductFingerprint !== fingerprint(product)) {
            throw scheduleError("PRODUCT_CHANGED_REVIEW_REQUIRED");
        }
        const assets = await Promise.all((item.metadata.mediaAssetIds || []).map(id => this.media.get(id)));
        if (!assets.length || assets.some(asset => !asset || !asset.checksum || asset.privacyStatus !== "clear" ||
            !["owned", "licensed", "customer_authorized"].includes(asset.ownershipStatus))) throw scheduleError("VERIFIED_MEDIA_REQUIRED");
        if (item.metadata.mediaFingerprint && item.metadata.mediaFingerprint !== fingerprint(assets)) throw scheduleError("MEDIA_CHANGED_REVIEW_REQUIRED");
        return { settings, item, product };
    }
    async schedule(id, input) {
        if (input.mode !== "dry-run") throw scheduleError("LIVE_PUBLISHING_NOT_AUTHORIZED");
        const { settings, item, product } = await this.validate(id);
        if (!item.platforms.includes(input.platform)) throw scheduleError("PLATFORM_NOT_APPROVED");
        const timestamp = Date.parse(input.scheduledFor);
        if (!Number.isFinite(timestamp) || timestamp < this.now().getTime()) throw scheduleError("SCHEDULE_MUST_BE_FUTURE");
        const scheduledFor = new Date(timestamp).toISOString();
        const date = new Intl.DateTimeFormat("en-CA", { timeZone: settings.timezone }).format(new Date(timestamp));
        const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
        if (settings.restDays.includes(weekday)) throw scheduleError("REST_DAY");
        const nextDay = new Date(Date.parse(`${date}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
        const maxDaily = input.platform === "facebook" ? settings.dailyTargets.facebookPosts
            : input.platform === "instagram" ? settings.dailyTargets.instagramPosts : settings.dailyTargets.tiktokVideos;
        if (!maxDaily) throw scheduleError("PLATFORM_DAILY_TARGET_ZERO");
        const account = await this.repository.sandboxAccount(input.platform);
        const variant = createPlatformVariant(item, product, input.platform);
        const idempotencyKey = fingerprint({ contentId: id, approval: item.metadata.approvalFingerprint,
            platform: input.platform, accountId: account.id, mode: "dry-run" });
        const schedule = await this.repository.queue({ contentId: id, accountId: account.id, platform: input.platform,
            scheduledFor, variant, approvalFingerprint: item.metadata.approvalFingerprint, idempotencyKey,
            maxDaily, dayStart: localTimeToIso(date, "00:00", settings.timezone),
            dayEnd: localTimeToIso(nextDay, "00:00", settings.timezone), minGap: 900 });
        await this.lifecycle.repository.audit({ actorType: "admin-api", action: "CONTENT_SCHEDULED_DRY_RUN",
            entityType: "content_item", entityId: id, afterData: { scheduleId: schedule.id, platform: input.platform, scheduledFor, externalRequestsSent: 0 } });
        return schedule;
    }
    async runDue() {
        const settings = await this.lifecycle.settings.getSettings();
        if (!settings.enabled) return { status: "BLOCKED", reason: "ENGINE_STOPPED", externalRequestsSent: 0 };
        const now = this.now().toISOString();
        const results = [];
        for (let index = 0; index < 20; index += 1) {
            const schedule = await this.repository.claim(now);
            if (!schedule) break;
            try {
                await this.validate(schedule.contentId, schedule.approvalFingerprint);
                const published = await this.repository.finish(schedule, now);
                results.push({ status: "SIMULATED_PUBLISHED", scheduleId: schedule.id, published });
            } catch (error) {
                await this.repository.skip(schedule.id);
                results.push({ status: "SKIPPED", scheduleId: schedule.id, reason: error.code || "PUBLICATION_VALIDATION_FAILED" });
            }
        }
        return { status: "DRY_RUN_COMPLETED", results, externalRequestsSent: 0, autoPublish: false };
    }
}

module.exports = { PublicationSchedulerService };
