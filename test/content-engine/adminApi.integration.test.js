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
    assert.equal((await request("/admin/api/content-engine/health")).status, 200);

    const catalogResponse = await request("/admin/api/content-engine/catalog/products?q=LLV-024");
    assert.equal(catalogResponse.status, 200);
    const catalog = await catalogResponse.json();
    assert.equal(catalog.products[0].reference, "LLV-024");

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
