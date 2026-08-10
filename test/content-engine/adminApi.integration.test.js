const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");

test("API real conserva aprobación manual desde catálogo hasta exportación", { timeout: 30_000 }, async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pixellabs-http-"));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    process.env.NODE_ENV = "test";
    process.env.ADMIN_API_TOKEN = "test-only-admin-token";
    process.env.CONTENT_ENGINE_WORK_DIR = path.join(directory, "work");
    process.env.CONTENT_ENGINE_UPLOAD_DIR = path.join(directory, "uploads");
    process.env.SOCIAL_PUBLISH_MODE = "draft";

    const { createApp } = require("../../server");
    const server = createApp().listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const address = server.address();
    const base = `http://127.0.0.1:${address.port}`;
    const request = (url, options = {}) => fetch(`${base}${url}`, {
        ...options,
        headers: {
            Authorization: "Bearer test-only-admin-token",
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    });

    assert.equal((await fetch(`${base}/admin/api/content-engine/health`)).status, 401);
    const healthResponse = await request("/admin/api/content-engine/health");
    assert.equal(healthResponse.status, 200);
    const health = await healthResponse.json();
    assert.equal(health.persistence, "local");
    assert.equal(health.databaseReachable, false);
    assert.equal(health.autoPublishDefault, false);

    const catalogResponse = await request("/admin/api/content-engine/catalog/products?q=LLV-024");
    assert.equal(catalogResponse.status, 200);
    const catalog = await catalogResponse.json();
    assert.equal(catalog.products[0].reference, "LLV-024");

    const trendResponse = await request("/admin/api/content-engine/trends/ingest", {
        method: "POST",
        body: JSON.stringify({
            observations: [{
                name: "Llaveros personalizados para regreso a clases",
                source: { collectionMethod: "manual" },
                signals: {
                    relevanceScore: 95,
                    salesPotential: 95,
                    messagesPotential: 95,
                    localInterest: 90,
                    productAvailability: 100,
                    ownedMediaAvailability: 100,
                    originalityPotential: 90,
                    productionDifficulty: 10,
                    expectedDuration: 10
                }
            }]
        })
    });
    assert.equal(trendResponse.status, 201);
    assert.equal((await trendResponse.json()).items[0].requiresHumanApproval, true);
    const trends = await (await request("/admin/api/content-engine/trends")).json();
    assert.equal(trends.items.length, 1);

    const planResponse = await request("/admin/api/content-engine/calendar/plan", {
        method: "POST",
        body: JSON.stringify({
            date: "2026-08-11",
            platforms: ["facebook", "instagram", "tiktok"]
        })
    });
    assert.equal(planResponse.status, 201);
    const plan = await planResponse.json();
    assert.equal(plan.slots.length, 9);
    assert.equal(new Set(plan.slots.map(slot => slot.plannedFor)).size, 9);
    assert.equal(plan.autoPublish, false);
    const calendar = await (await request(
        "/admin/api/content-engine/calendar?date=2026-08-11"
    )).json();
    assert.equal(calendar.slots.length, 9);

    const metrics = await (await request(
        "/admin/api/content-engine/metrics/summary"
    )).json();
    assert.equal(metrics.summary.records, 0);
    assert.equal(metrics.summary.totals.sales, 0);

    const draftResponse = await request("/admin/api/content-engine/content", {
        method: "POST",
        body: JSON.stringify({
            productReference: "LLV-024",
            objective: "Conseguir mensajes calificados",
            format: "reel",
            title: "Tu nombre convertido en llavero",
            primaryText: "Así fabricamos un llavero personalizado.",
            callToAction: "Escríbenos para cotizar.",
            hashtags: ["PixelLabs", "Impresión3D"],
            platforms: ["facebook", "instagram", "tiktok"]
        })
    });
    assert.equal(draftResponse.status, 201);
    const draft = (await draftResponse.json()).item;
    assert.equal(draft.status, "DRAFT");

    const reviewResponse = await request(`/admin/api/content-engine/content/${draft.id}/review`, {
        method: "POST",
        body: JSON.stringify({
            scores: {
                visual: 98,
                spelling: 100,
                commercial: 98,
                brand: 97,
                originality: 96,
                privacy: 100,
                technical: 99,
                businessPotential: 94
            },
            privacyRisk: false,
            copyrightRisk: 0,
            trademarkRisk: 0,
            hasThirdPartyWatermark: false,
            isDuplicate: false,
            templateApproved: true,
            newTrend: false,
            ownedOrLicensedMedia: true
        })
    });
    assert.equal(reviewResponse.status, 200);
    const reviewed = await reviewResponse.json();
    assert.equal(reviewed.item.status, "REQUIRES_HUMAN_APPROVAL");
    assert.equal(reviewed.decision.eligibleForAutomaticPublishing, false);

    const approvalResponse = await request(`/admin/api/content-engine/content/${draft.id}/approve`, {
        method: "POST"
    });
    assert.equal(approvalResponse.status, 200);
    assert.equal((await approvalResponse.json()).item.status, "APPROVED");

    const exportResponse = await request(
        `/admin/api/content-engine/content/${draft.id}/export/instagram`,
        { method: "POST" }
    );
    assert.equal(exportResponse.status, 200);
    const exported = await exportResponse.json();
    assert.equal(exported.variant.status, "DRAFT");
    assert.equal(exported.publication.externalRequestSent, false);
    assert.equal(exported.publication.autoPublish, false);
});
