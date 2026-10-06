const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

test("panel API uploads owned media, invalidates edits and schedules only manually approved simulations", async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pixellabs-publication-http-"));
    Object.assign(process.env, { NODE_ENV: "test", ADMIN_API_TOKEN: "qa-publication-token", REQUIRE_SUPABASE: "false",
        CONTENT_ENGINE_WORK_DIR: directory, CONTENT_ENGINE_VIDEO_MODE: "disabled", SOCIAL_OAUTH_ENABLED: "false",
        CONTENT_ENGINE_AI_ENABLED: "false", SOCIAL_PUBLISH_MODE: "draft", SOCIAL_EXTERNAL_REQUESTS_ENABLED: "false" });
    delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { createApp } = require("../../server");
    const server = createApp().listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    t.after(async () => { await new Promise(resolve => server.close(resolve)); await fs.rm(directory, { recursive: true, force: true }); });
    const base = `http://127.0.0.1:${server.address().port}/admin/api/content-engine`;
    const request = (url, method = "GET", body, headers = {}) => fetch(base + url, {
        method, headers: { Authorization: "Bearer qa-publication-token", "Content-Type": "application/json", ...headers },
        body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body)
    });
    assert.equal((await request("/settings", "PATCH", { approvalMode: "advanced", autoPublish: true })).status, 409);
    assert.equal((await request("/social/oauth/meta/start", "POST")).status, 409);
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRL8AAAAASUVORK5CYII=", "base64");
    assert.equal((await request("/catalog/products/LLV-024/media/image", "POST", png, { "Content-Type": "image/png" })).status, 409);
    const upload = await request("/catalog/products/LLV-024/media/image", "POST", png,
        { "Content-Type": "image/png", "X-PixelLabs-Ownership": "owned", "X-PixelLabs-Privacy": "clear" });
    assert.equal(upload.status, 201);
    const asset = (await upload.json()).asset;
    assert.match(asset.checksum, /^[a-f0-9]{64}$/);
    const preview = await request(`/media/${asset.id}/preview`);
    assert.equal(preview.status, 200);
    assert.equal((await preview.json()).url, `data:image/png;base64,${png.toString("base64")}`);
    const item = (await (await request("/content", "POST", { productReference: "LLV-024", objective: "QA consultas",
        title: "QA foto propia", primaryText: "QA producto de catálogo", format: "image", platforms: ["facebook"] })).json()).item;
    const schedule = { platform: "facebook", scheduledFor: new Date(Date.now() + 3600000).toISOString(), mode: "dry-run" };
    assert.equal((await request(`/content/${item.id}/schedule`, "POST", schedule)).status, 409);
    assert.equal((await request(`/content/${item.id}`, "PATCH", { mediaAssetIds: [asset.id] })).status, 200);
    const scores = Object.fromEntries(["visual", "spelling", "commercial", "brand", "originality", "privacy", "technical", "businessPotential"].map(name => [name, 95]));
    const reviewed = await request(`/content/${item.id}/review`, "POST", { scores, ownedOrLicensedMedia: true });
    assert.equal((await reviewed.json()).item.status, "REQUIRES_HUMAN_APPROVAL");
    assert.equal((await request(`/content/${item.id}/approve`, "POST")).status, 200);
    assert.equal((await request(`/content/${item.id}/schedule`, "POST", { ...schedule, mode: "live" })).status, 422);
    const scheduled = await request(`/content/${item.id}/schedule`, "POST", schedule);
    assert.equal(scheduled.status, 201);
    assert.equal((await scheduled.json()).externalRequestsSent, 0);
    assert.equal((await (await request("/publication-calendar")).json()).schedules.length, 1);
    const edited = await request(`/content/${item.id}`, "PATCH", { primaryText: "QA copy editado" });
    assert.equal((await edited.json()).item.status, "DRAFT");
    assert.equal((await request(`/content/${item.id}/schedule`, "POST", schedule)).status, 409);
});
