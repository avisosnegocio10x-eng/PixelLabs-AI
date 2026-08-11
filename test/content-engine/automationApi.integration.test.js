const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");

test("n8n usa una API limitada y no recibe permisos administrativos", async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pixellabs-automation-http-"));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    process.env.NODE_ENV = "test";
    process.env.REQUIRE_SUPABASE = "false";
    process.env.CONTENT_ENGINE_AUTO_PUBLISH = "false";
    process.env.SOCIAL_PUBLISH_MODE = "draft";
    process.env.CONTENT_ENGINE_WORK_DIR = directory;
    process.env.N8N_WEBHOOK_SECRET = "n8n-limited-test-token";
    process.env.ADMIN_API_TOKEN = "different-admin-token";
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const { createApp } = require("../../server");
    const server = createApp().listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}`;

    const denied = await fetch(`${base}/automation/jobs/video-processing`, {
        method: "POST",
        headers: {
            authorization: "Bearer different-admin-token",
            "content-type": "application/json"
        },
        body: "{}"
    });
    assert.equal(denied.status, 401);

    const headers = {
        authorization: "Bearer n8n-limited-test-token",
        "content-type": "application/json"
    };
    const createdResponse = await fetch(`${base}/automation/jobs/video-processing`, {
        method: "POST",
        headers,
        body: JSON.stringify({ source: "n8n" })
    });
    assert.equal(createdResponse.status, 202);
    const created = (await createdResponse.json()).job;
    assert.equal(created.status, "QUEUED");
    assert.equal(created.executionTarget, "local-video");

    const statusResponse = await fetch(
        `${base}/automation/jobs/status/${created.id}`,
        { headers }
    );
    assert.equal(statusResponse.status, 200);
    assert.equal((await statusResponse.json()).job.id, created.id);

    const forbiddenUpdate = await fetch(
        `${base}/automation/jobs/status/${created.id}`,
        {
            method: "PATCH",
            headers,
            body: JSON.stringify({ status: "COMPLETED" })
        }
    );
    assert.equal(forbiddenUpdate.status, 404);
});
