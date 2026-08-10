const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { FileMetricsRepository } = require("../../src/contentEngine/repositories/metricsRepository");
const { MetricsService } = require("../../src/contentEngine/services/metricsService");

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
    const weekly = await service.weeklyRecommendations();
    assert.equal(weekly.automaticSettingsChanged, false);
    assert.equal(weekly.recommendations[0].platform, "instagram");
});
