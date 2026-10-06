const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { FileContentRepository } = require("../../src/contentEngine/repositories/contentRepository");
const { FileCatalogRepository } = require("../../src/contentEngine/repositories/catalogRepository");
const { FileSettingsRepository } = require("../../src/contentEngine/repositories/settingsRepository");
const { FileEditorialPlanRepository } = require("../../src/contentEngine/repositories/editorialPlanRepository");
const { FilePublicationRepository } = require("../../src/contentEngine/repositories/publicationRepository");
const { FileMetricsRepository } = require("../../src/contentEngine/repositories/metricsRepository");
const { ContentSettingsService } = require("../../src/contentEngine/services/contentSettingsService");
const { ContentLifecycleService } = require("../../src/contentEngine/services/contentLifecycleService");
const { EditorialPlannerService } = require("../../src/contentEngine/services/editorialPlannerService");
const { DailyContentPipelineService } = require("../../src/contentEngine/services/dailyContentPipelineService");
const { PublicationSchedulerService } = require("../../src/contentEngine/services/publicationSchedulerService");
const { MetricsService } = require("../../src/contentEngine/services/metricsService");
const { GeminiContentProvider } = require("../../src/contentEngine/services/geminiContentProvider");
const { FileTrendRepository } = require("../../src/contentEngine/repositories/trendRepository");
const { TrendRadarService } = require("../../src/contentEngine/services/trendRadarService");
const scores = Object.fromEntries(["visual","spelling","commercial","brand","originality","privacy","technical","businessPotential"].map(type => [type, 95]));

async function fixture(t, options = {}) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pixellabs-daily-qa-"));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const settings = new ContentSettingsService(new FileSettingsRepository(path.join(directory, "settings.json")));
    const lifecycle = new ContentLifecycleService({ settings,
        catalog: new FileCatalogRepository(path.join(directory, "catalog.json")),
        repository: new FileContentRepository(path.join(directory, "content.json")) });
    const publications = new FilePublicationRepository(path.join(directory, "publishing.json"));
    const assets = ["image", "video"].map(type => ({ id: crypto.randomUUID(), type,
        storageBucket: "qa-private", storagePath: `qa.${type}`, mimeType: type === "image" ? "image/jpeg" : "video/mp4",
        checksum: "a".repeat(64), ownershipStatus: "owned", privacyStatus: "clear", metadata: { fixture: true } }));
    const media = { forProduct: async () => options.missingMedia ? [] : assets,
        get: async id => assets.find(item => item.id === id) };
    const provider = { model: "qa-mock", calls: 0, json: async (task, input) => {
        provider.calls += 1;
        if (input.content) return { scores: { ...scores, spelling: options.correctCopy && input.content.caption.includes("  ") ? 20 : 95 },
            findings: {}, privacyRisk: false, copyrightRisk: 0, trademarkRisk: 0 };
        return { title: `QA ${input.platform}`, caption: `QA${options.correctCopy ? "  " : " "}${input.platform}: ${input.concept}`,
            callToAction: "Escríbenos para consultar.", hashtags: ["PixelLabs"], strategy: "QA: generar consultas sobre un producto existente." };
    } };
    const trends = new TrendRadarService({ settings, repository: new FileTrendRepository(path.join(directory, "trends.json")) });
    const planner = new EditorialPlannerService({ settings, catalog: lifecycle.catalog,
        repository: new FileEditorialPlanRepository(path.join(directory, "plan.json")), trends });
    const daily = new DailyContentPipelineService({ lifecycle, planner, publications, media, provider });
    let current = new Date("2026-10-06T06:00:00Z");
    const scheduler = new PublicationSchedulerService({ lifecycle, publications, media, now: () => current });
    return { lifecycle, settings, planner, publications, daily, scheduler, provider, trends,
        clock: value => { current = new Date(value); }, directory };
}

test("daily plan → drafts → eight reviews → human approval → schedule → simulated publishing → metrics", async t => {
    const f = await fixture(t, { correctCopy: true });
    const [trend] = await f.trends.ingest([{ name: "QA: interés observado por regalos personalizados", source: { collectionMethod: "first_party" },
        signals: { relevanceScore: 100, salesPotential: 100, messagesPotential: 100, commentsPotential: 100, localInterest: 100,
            conversionEase: 100, productAvailability: 100, ownedMediaAvailability: 100, originalityPotential: 100,
            productionDifficulty: 0, expectedDuration: 0 } }]);
    const result = await f.daily.runDay({ date: "2026-10-06" });
    assert.equal(result.awaitingApproval, 3);
    assert.equal(result.externalRequestsSent, 0);
    const items = await f.lifecycle.repository.list();
    assert.ok((await f.planner.list("2026-10-06")).some(slot => slot.trendId === trend.id));
    assert.ok(items.every(item => item.metadata.correctionAttempt === 1 && !item.primaryText.includes("  ")));
    assert.equal(new Set(items.map(item => item.primaryText)).size, 3);
    assert.ok(items.every(item => item.status === "REQUIRES_HUMAN_APPROVAL"));
    await assert.rejects(f.scheduler.schedule(items[0].id, { platform: items[0].platforms[0], scheduledFor: "2026-10-06T18:00:00Z", mode: "dry-run" }),
        error => error.code === "CONTENT_NOT_MANUALLY_APPROVED");
    const before = f.provider.calls;
    const rerun = await f.daily.runDay({ date: "2026-10-06" });
    assert.equal(rerun.results.length, 3);
    assert.equal(f.provider.calls, before);
    for (const item of items) {
        assert.equal((await f.lifecycle.repository.getReviews(item.id)).length, 8);
        assert.equal((await f.lifecycle.repository.getReviewHistory(item.id)).length, 16);
        await f.lifecycle.approve(item.id);
        const input = { platform: item.platforms[0], scheduledFor: "2026-10-06T18:00:00Z", mode: "dry-run" };
        const first = await f.scheduler.schedule(item.id, input);
        assert.equal((await f.scheduler.schedule(item.id, input)).id, first.id);
        await assert.rejects(f.scheduler.schedule(item.id, { ...input, mode: "live" }), error => error.code === "LIVE_PUBLISHING_NOT_AUTHORIZED");
    }
    f.clock("2026-10-06T18:01:00Z");
    const concurrent = await Promise.all([f.scheduler.runDue(), f.scheduler.runDue()]);
    const published = concurrent.flatMap(result => result.results).map(result => result.published);
    assert.equal(published.length, 3);
    assert.ok(published.every(item => item.isSimulated && item.externalRequestsSent === 0));
    assert.equal((await f.scheduler.runDue()).results.length, 0);
    const metrics = new MetricsService({ repository: new FileMetricsRepository(path.join(f.directory, "metrics.json")) });
    await metrics.recordBatch(published.map(item => ({ publishedContentId: item.id, platform: item.platform,
        views: 10, rawMetrics: { simulated: true } })));
    assert.equal((await metrics.repository.listRecent()).length, 3);
    assert.equal((await metrics.summary()).records, 0, "simulations must not influence commercial learning");
    assert.equal((await f.settings.getSettings()).autoPublish, false);
});

test("editing, stock changes and emergency stop invalidate scheduled content", async t => {
    const f = await fixture(t);
    await f.daily.runDay({ date: "2026-10-06" });
    const item = (await f.lifecycle.repository.list())[0];
    await f.lifecycle.approve(item.id);
    await f.scheduler.schedule(item.id, { platform: item.platforms[0], scheduledFor: "2026-10-06T18:00:00Z", mode: "dry-run" });
    const edited = await f.lifecycle.edit(item.id, { primaryText: "QA: texto nuevo pendiente de revisión." });
    assert.equal(edited.status, "DRAFT");
    assert.equal(edited.approvedAt, null);
    f.clock("2026-10-06T18:01:00Z");
    assert.equal((await f.scheduler.runDue()).results[0].status, "SKIPPED");
    await f.settings.setEmergencyStop(true);
    assert.equal((await f.scheduler.runDue()).reason, "ENGINE_STOPPED");
});

test("missing media cannot pass automatic review even when the model gives perfect scores", async t => {
    const f = await fixture(t, { missingMedia: true });
    const result = await f.daily.runDay({ date: "2026-10-06" });
    assert.equal(result.awaitingApproval, 0);
    assert.ok((await f.lifecycle.repository.list()).every(item => item.status === "NEEDS_CORRECTION"));
});

test("stock and media changes after approval block consumption", async t => {
    const f = await fixture(t);
    await f.daily.runDay({ date: "2026-10-06" });
    const item = (await f.lifecycle.repository.list())[0];
    await f.lifecycle.approve(item.id);
    await f.scheduler.schedule(item.id, { platform: item.platforms[0], scheduledFor: "2026-10-06T18:00:00Z", mode: "dry-run" });
    await f.lifecycle.catalog.update(item.productReference, { availabilityStatus: "OUT_OF_STOCK" });
    f.clock("2026-10-06T18:01:00Z");
    const result = (await f.scheduler.runDue()).results[0];
    assert.equal(result.status, "SKIPPED");
    assert.equal(result.reason, "PRODUCT_UNAVAILABLE");
    assert.equal((await f.publications.store.read()).published.length, 0);
});

test("quota reservation is atomic and persists across repository instances", async t => {
    const f = await fixture(t);
    const results = await Promise.allSettled(Array.from({ length: 6 }, (_, index) => f.publications.reserve(`qa-${index}`, 2)));
    assert.equal(results.filter(item => item.status === "fulfilled").length, 2);
    const restarted = new FilePublicationRepository(path.join(f.directory, "publishing.json"));
    await assert.rejects(restarted.reserve("after-restart", 2), error => error.code === "GEMINI_DAILY_REQUEST_LIMIT");
});

test("Gemini never sends a request without free-tier confirmation and redacts provider errors", async () => {
    let calls = 0;
    const provider = new GeminiContentProvider({ env: { GEMINI_API_KEY: "qa-key", CONTENT_ENGINE_AI_ENABLED: "true" },
        http: { post: async () => { calls += 1; } } });
    await assert.rejects(provider.json("qa", {}, {}), error => error.code === "GEMINI_FREE_TIER_NOT_CONFIRMED");
    assert.equal(calls, 0);
    const enabled = new GeminiContentProvider({ env: { GEMINI_API_KEY: "qa-key", CONTENT_ENGINE_AI_ENABLED: "true",
        CONTENT_ENGINE_GEMINI_FREE_TIER_CONFIRMED: "true" }, http: { post: async () => {
        throw Object.assign(new Error("qa-key secret in vendor error"), { response: { status: 429 } });
    } } });
    await assert.rejects(enabled.json("qa", {}, {}), error => error.code === "GEMINI_FREE_QUOTA_EXHAUSTED" && !error.message.includes("qa-key"));
});
