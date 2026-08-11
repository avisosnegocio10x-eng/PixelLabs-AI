const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { WorkflowJobService } = require("../../src/contentEngine/services/workflowJobService");
const { WorkflowJobRunner } = require("../../src/contentEngine/services/workflowJobRunner");
const { FileWorkflowJobRepository } = require("../../src/contentEngine/repositories/workflowJobRepository");

test("Render no consume trabajos reservados para el agente local", async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pixellabs-local-queue-"));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const repository = new FileWorkflowJobRepository(directory);
    const service = new WorkflowJobService({ repository });
    const runner = new WorkflowJobRunner(service, {
        handlers: {
            "video-processing": async () => {
                throw new Error("Render no debe ejecutar este manejador");
            }
        }
    });
    const created = await service.create("video-processing", {
        workerId: "pixellabs-pc",
        source: { relativePath: "video.mp4" }
    }, "local-video-1");
    assert.equal(created.executionTarget, "local-video");
    assert.equal((await runner.run(created.id)).status, "QUEUED");
    assert.equal(await runner.recover(), 0);

    const claimed = await service.claimNext("pixellabs-pc", { leaseSeconds: 120 });
    assert.equal(claimed.status, "RUNNING");
    assert.equal(claimed.lockedBy, "pixellabs-pc");
    assert.equal(claimed.attempt, 1);

    await assert.rejects(
        () => service.update(created.id, { status: "COMPLETED", result: {} }),
        error => error.code === "LOCAL_WORKER_OWNS_JOB"
    );
    await assert.rejects(
        () => service.heartbeat(created.id, "otra-pc", { progress: 10 }),
        error => error.code === "WORKER_LEASE_MISMATCH"
    );
    const heartbeat = await service.heartbeat(created.id, "pixellabs-pc", {
        progress: 50,
        stage: "SEGMENTING"
    });
    assert.equal(heartbeat.result.progress, 50);
    assert.equal(heartbeat.result.stage, "SEGMENTING");

    const completed = await service.completeFromWorker(created.id, "pixellabs-pc", {
        clips: 2
    });
    assert.equal(completed.status, "COMPLETED");
    assert.equal(completed.lockedBy, null);
    assert.equal(completed.result.clips, 2);
});

test("otro agente recupera un arrendamiento local vencido", async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pixellabs-local-lease-"));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const repository = new FileWorkflowJobRepository(directory);
    const service = new WorkflowJobService({ repository });
    const created = await service.create("clip-editing", {}, "expired-lease");
    await repository.update(created.id, {
        status: "RUNNING",
        lockedBy: "worker-offline",
        lockedAt: new Date(Date.now() - 120_000).toISOString(),
        leaseExpiresAt: new Date(Date.now() - 60_000).toISOString()
    });
    await assert.rejects(
        () => service.completeFromWorker(created.id, "worker-offline", {}),
        error => error.code === "WORKER_LEASE_MISMATCH"
    );
    const recovered = await service.claimNext("worker-recovery", { leaseSeconds: 60 });
    assert.equal(recovered.id, created.id);
    assert.equal(recovered.lockedBy, "worker-recovery");
    assert.equal(recovered.attempt, 1);
});
