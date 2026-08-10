const test = require("node:test");
const assert = require("node:assert/strict");

test("el perfil gratuito conserva la API y bloquea archivos de video", async t => {
    process.env.NODE_ENV = "test";
    process.env.ADMIN_API_TOKEN = "free-profile-test-token";
    process.env.REQUIRE_SUPABASE = "false";
    process.env.CONTENT_ENGINE_VIDEO_MODE = "disabled";
    process.env.CONTENT_ENGINE_LOCAL_STORAGE_DURABLE = "false";
    process.env.CONTENT_ENGINE_AUTO_PUBLISH = "false";
    process.env.SOCIAL_PUBLISH_MODE = "draft";
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const { createApp } = require("../../server");
    const server = createApp().listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}`;
    const headers = {
        Authorization: "Bearer free-profile-test-token",
        "Content-Type": "application/json"
    };

    const publicHealth = await fetch(`${base}/healthz`);
    assert.equal(publicHealth.status, 200);
    assert.equal((await publicHealth.json()).videoMode, "disabled");

    const health = await fetch(`${base}/admin/api/content-engine/health`, { headers });
    assert.equal(health.status, 200);
    assert.equal((await health.json()).videoRuntime.enabled, false);

    const videos = await fetch(`${base}/admin/api/content-engine/videos`, { headers });
    assert.equal(videos.status, 200);
    const videoBody = await videos.json();
    assert.deepEqual(videoBody.videos, []);
    assert.equal(videoBody.videoRuntime.mode, "disabled");

    const blocked = await fetch(`${base}/admin/api/content-engine/videos/uploads`, {
        method: "POST",
        headers,
        body: JSON.stringify({
            filename: "largo.mp4",
            totalBytes: 1024,
            mimeType: "video/mp4"
        })
    });
    assert.equal(blocked.status, 503);
    assert.equal((await blocked.json()).error, "VIDEO_PROCESSING_DISABLED");

    const catalog = await fetch(
        `${base}/admin/api/content-engine/catalog/products?q=LLV-024`,
        { headers }
    );
    assert.equal(catalog.status, 200);
    assert.equal((await catalog.json()).products[0].reference, "LLV-024");
});
