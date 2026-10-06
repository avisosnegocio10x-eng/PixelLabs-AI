const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { FileMetricsRepository } = require("../../src/contentEngine/repositories/metricsRepository");
const { MetricsService } = require("../../src/contentEngine/services/metricsService");
const crypto = require("node:crypto");

test("prioriza ventas y mensajes sobre visualizaciones aisladas", async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pixellabs-metrics-"));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const service = new MetricsService({
        repository: new FileMetricsRepository(path.join(directory, "metrics.json"))
    });
    await service.recordBatch([
        {
            publishedContentId: "11111111-1111-4111-8111-111111111111",
            capturedAt: "2026-08-10T18:00:00.000Z",
            platform: "facebook",
            views: 100000,
            messages: 0,
            sales: 0
        },
        {
            publishedContentId: "22222222-2222-4222-8222-222222222222",
            capturedAt: "2026-08-10T18:00:00.000Z",
            platform: "instagram",
            views: 1000,
            messages: 12,
            quoteRequests: 4,
            sales: 2,
            revenue: 40
        }
    ]);
    const summary = await service.summary();
    assert.equal(summary.bestPlatform, "instagram");
    assert.equal(summary.totals.sales, 2);
    assert.deepEqual(summary.priority, ["revenue", "sales", "quoteRequests", "messages", "views"]);
    const weekly = await service.weeklyRecommendations({ now: new Date("2026-08-11T18:00:00Z") });
    assert.equal(weekly.automaticSettingsChanged, false);
    assert.equal(weekly.recommendations[0].platform, "instagram");
});

test("weekly learning compares content patterns, uses latest counters and excludes simulated posts", async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pixellabs-learning-"));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const service = new MetricsService({ repository: new FileMetricsRepository(path.join(directory, "metrics.json")) });
    const items = Array.from({ length: 6 }, (_, index) => ({ publishedContentId: crypto.randomUUID(), platform: "facebook",
        capturedAt: "2026-10-06T12:00:00Z", views: 100, messages: index < 3 ? 4 : 1,
        rawMetrics: { publicationContext: { format: index < 3 ? "reel" : "image", productReference: "LLV-024",
            hook: "QA personalizado", topic: "producto", durationMs: index < 3 ? 12000 : null,
            callToAction: "Consulta por mensaje", publishedAt: "2026-10-05T18:30:00Z" } } }));
    await service.recordBatch(items);
    await service.recordBatch([{ ...items[0], capturedAt: "2026-10-06T13:00:00Z", views: 200 },
        { ...items[1], publishedContentId: crypto.randomUUID(), messages: 9999, rawMetrics: { simulated: true } }]);
    const weekly = await service.weeklyRecommendations({ now: new Date("2026-10-06T14:00:00Z") });
    assert.equal(weekly.summary.records, 6);
    assert.equal(weekly.summary.totals.views, 700);
    assert.equal(weekly.summary.totals.messages, 15);
    assert.equal(weekly.summary.comparisons.format[0].value, "reel");
    assert.equal(weekly.summary.comparisons.hour[0].value, "12");
    const recommendation = weekly.recommendations.find(item => item.dimension === "format");
    assert.equal(recommendation.value, "reel");
    assert.equal(recommendation.requiresHumanApproval, true);
    assert.equal(weekly.automaticSettingsChanged, false);
});
