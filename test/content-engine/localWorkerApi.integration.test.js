const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");

test("la API del agente local usa un token separado y no ejecuta video en Render", async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pixellabs-worker-http-"));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    process.env.NODE_ENV = "test";
    process.env.REQUIRE_SUPABASE = "false";
    process.env.CONTENT_ENGINE_AUTO_PUBLISH = "false";
    process.env.SOCIAL_PUBLISH_MODE = "draft";
    process.env.CONTENT_ENGINE_WORK_DIR = directory;
    process.env.LOCAL_WORKER_API_TOKEN = "local-worker-test-token";
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const { createApp } = require("../../server");
    const server = createApp().listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}`;
    const body = {
        type: "video-processing",
        source: {
            relativePath: "video-largo.mp4",
            filename: "video-largo.mp4",
            byteSize: 5000,
            mimeType: "video/mp4"
        },
        payload: {}
    };

    assert.equal((await fetch(`${base}/worker/jobs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
    })).status, 401);

    const headers = {
        authorization: "Bearer local-worker-test-token",
        "x-worker-id": "pixellabs-pc-test",
        "content-type": "application/json"
    };
    const createdResponse = await fetch(`${base}/worker/jobs`, {
        method: "POST",
        headers,
        body: JSON.stringify(body)
    });
    assert.equal(createdResponse.status, 202);
    const created = (await createdResponse.json()).job;
    assert.equal(created.executionTarget, "local-video");
    assert.equal(created.status, "QUEUED");

    const claimResponse = await fetch(`${base}/worker/jobs/claim`, {
        method: "POST",
        headers,
        body: JSON.stringify({
            leaseSeconds: 120,
            capabilities: ["ffmpeg", "ffprobe", "tus-upload"]
        })
    });
    assert.equal(claimResponse.status, 200);
    const claimed = (await claimResponse.json()).job;
    assert.equal(claimed.id, created.id);
    assert.equal(claimed.status, "RUNNING");
});
