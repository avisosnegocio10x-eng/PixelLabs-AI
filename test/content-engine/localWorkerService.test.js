const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { WorkflowJobService } = require("../../src/contentEngine/services/workflowJobService");
const { FileWorkflowJobRepository } = require("../../src/contentEngine/repositories/workflowJobRepository");
const {
    LocalWorkerService,
    storageEndpointFromProjectUrl
} = require("../../src/contentEngine/services/localWorkerService");

test("entrega tickets temporales y devuelve clips sin exponer service_role", async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pixellabs-local-service-"));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const previousUrl = process.env.SUPABASE_URL;
    process.env.SUPABASE_URL = "https://exampleproject.supabase.co";
    t.after(() => {
        if (previousUrl === undefined) delete process.env.SUPABASE_URL;
        else process.env.SUPABASE_URL = previousUrl;
    });

    const uploaded = new Map();
    const fakeStorageBucket = {
        createSignedUploadUrl: async storagePath => ({
            data: { token: "temporary-ticket-token", path: storagePath },
            error: null
        }),
        info: async storagePath => ({ data: uploaded.get(storagePath) || null, error: null })
    };
    const fakeClient = { storage: { from: () => fakeStorageBucket } };
    let synced = null;
    const videoRepository = {
        syncRemoteResult: async (...input) => { synced = input; }
    };
    const jobs = new WorkflowJobService({
        repository: new FileWorkflowJobRepository(directory)
    });
    const service = new LocalWorkerService({
        jobs,
        client: fakeClient,
        videoRepository,
        bucket: "pixellabs-content",
        maxArtifactBytes: 1024 * 1024
    });
    const job = await service.create("pixellabs-pc", {
        type: "video-processing",
        source: {
            relativePath: "prueba.mp4",
            filename: "prueba.mp4",
            byteSize: 100,
            mimeType: "video/mp4"
        },
        payload: {}
    });
    await assert.rejects(
        () => service.claim("pixellabs-pc", { capabilities: [] }),
        error => error.code === "WORKER_CAPABILITIES_REQUIRED"
    );
    const claimed = await service.claim("pixellabs-pc", {
        capabilities: ["ffmpeg", "ffprobe", "tus-upload"]
    });
    assert.equal(claimed.id, job.id);
    const ticket = await service.createArtifactTicket(job.id, "pixellabs-pc", {
        artifactType: "clip-video",
        filename: "clip.mp4",
        contentType: "video/mp4",
        byteSize: 500,
        checksumSha256: "a".repeat(64)
    });
    assert.equal(ticket.bucket, "pixellabs-content");
    assert.equal(ticket.token, "temporary-ticket-token");
    assert.match(ticket.resumableEndpoint, /^https:\/\/exampleproject\.storage\.supabase\.co\//);
    assert.equal(JSON.stringify(ticket).includes("service_role"), false);
    uploaded.set(ticket.storagePath, { size: 500 });

    const result = {
        source: {
            filename: "prueba.mp4",
            byteSize: 100,
            mimeType: "video/mp4",
            checksumSha256: "b".repeat(64),
            durationMs: 1000
        },
        analysis: { summary: {}, segments: [], moments: [], clips: [] },
        artifacts: [{
            artifactType: "clip-video",
            filename: "clip.mp4",
            contentType: "video/mp4",
            byteSize: 500,
            checksumSha256: "a".repeat(64),
            storagePath: ticket.storagePath
        }]
    };
    const completed = await service.complete(job.id, "pixellabs-pc", result);
    assert.equal(completed.status, "COMPLETED");
    assert.equal(completed.result.autoPublish, false);
    assert.equal(completed.result.requiresHumanApproval, true);
    assert.equal(synced[0].id, job.id);
});

test("deriva únicamente el endpoint directo oficial de Storage", () => {
    assert.equal(
        storageEndpointFromProjectUrl("https://abc.supabase.co"),
        "https://abc.storage.supabase.co/storage/v1/upload/resumable"
    );
    assert.throws(
        () => storageEndpointFromProjectUrl("https://storage.example.com"),
        error => error.code === "SUPABASE_STORAGE_URL_INVALID"
    );
});
