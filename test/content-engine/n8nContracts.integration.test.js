const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const workflows = [
    ["trend-research", { observations: [{
        name: "Llaveros personalizados para regreso a clases",
        source: { collectionMethod: "manual", name: "Prueba autorizada" }
    }] }],
    ["editorial-plan", { date: "2026-08-12" }],
    ["content-generation", { productReference: "LLV-024" }],
    ["video-processing", { uploadId: "00000000-0000-4000-8000-000000000041" }],
    ["clip-editing", { clipId: "00000000-0000-4000-8000-000000000051" }],
    ["multi-review", {}],
    ["content-correction", {}],
    ["approval-routing", {}],
    ["schedule-publish", {}],
    ["metrics-sync", {}],
    ["weekly-optimization", {}],
    ["error-recovery", {}]
];

test("los doce contratos n8n encolan datos de prueba sin publicar", async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pixellabs-n8n-contracts-"));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    process.env.NODE_ENV = "test";
    process.env.REQUIRE_SUPABASE = "false";
    process.env.CONTENT_ENGINE_AUTO_PUBLISH = "false";
    process.env.SOCIAL_PUBLISH_MODE = "draft";
    process.env.SOCIAL_EXTERNAL_REQUESTS_ENABLED = "false";
    process.env.CONTENT_ENGINE_WORK_DIR = directory;
    process.env.N8N_WEBHOOK_SECRET = "n8n-contract-token-with-32-characters";
    process.env.ADMIN_API_TOKEN = "admin-contract-token-separate";
    process.env.LOCAL_WORKER_API_TOKEN = "worker-contract-token-separate";
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const { createApp } = require("../../server");
    const server = createApp().listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}`;
    const jobs = new Map();

    for (const [workflow, fixture] of workflows) {
        const response = await fetch(`${base}/automation/jobs/${workflow}`, {
            method: "POST",
            headers: {
                authorization: "Bearer n8n-contract-token-with-32-characters",
                "content-type": "application/json",
                "idempotency-key": `${workflow}:contract-test`,
                "x-pixellabs-workflow": workflow
            },
            body: JSON.stringify({
                ...fixture,
                source: "n8n",
                n8nExecutionId: `contract-${workflow}`
            })
        });
        assert.equal(response.status, 202, workflow);
        const job = (await response.json()).job;
        assert.equal(job.type, workflow);
        jobs.set(workflow, job);
    }

    for (const [workflow, initial] of jobs) {
        if (initial.executionTarget === "local-video") {
            assert.equal(initial.status, "QUEUED", workflow);
            continue;
        }
        let job = initial;
        for (let attempt = 0; attempt < 100 && !["COMPLETED", "FAILED"].includes(job.status); attempt += 1) {
            await new Promise(resolve => setTimeout(resolve, 20));
            const response = await fetch(`${base}/automation/jobs/status/${job.id}`, {
                headers: { authorization: "Bearer n8n-contract-token-with-32-characters" }
            });
            assert.equal(response.status, 200, workflow);
            job = (await response.json()).job;
        }
        assert.equal(job.status, "COMPLETED", workflow);
        if (workflow === "schedule-publish") {
            assert.equal(job.result.externalRequestsSent, 0);
            assert.equal(job.result.reason, "AUTO_PUBLISH_DISABLED");
        }
    }

    const events = await fs.readFile(
        path.join(directory, "workflow-jobs", "workflow-events.jsonl"),
        "utf8"
    );
    assert.ok(events.trim().split("\n").length >= 32);
    assert.doesNotMatch(events, /observations|productReference|n8nExecutionId/);
});
