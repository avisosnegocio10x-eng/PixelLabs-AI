const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const {
    WorkflowJobService
} = require("../../src/contentEngine/services/workflowJobService");
const {
    FileWorkflowJobRepository
} = require("../../src/contentEngine/repositories/workflowJobRepository");

test("crea trabajos idempotentes para los flujos de n8n", async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pixellabs-jobs-"));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const service = new WorkflowJobService({
        repository: new FileWorkflowJobRepository(directory)
    });

    const first = await service.create("trend-research", { date: "2026-08-06" }, "daily-2026-08-06");
    const duplicate = await service.create("trend-research", { date: "changed" }, "daily-2026-08-06");

    assert.equal(first.id, duplicate.id);
    assert.equal(duplicate.payload.date, "2026-08-06");
});

test("rechaza tipos de flujo no registrados", async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pixellabs-jobs-"));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const service = new WorkflowJobService({
        repository: new FileWorkflowJobRepository(directory)
    });

    await assert.rejects(
        () => service.create("publicar-sin-revision"),
        /Flujo desconocido/
    );
});

test("n8n puede actualizar el resultado de un trabajo persistente", async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pixellabs-jobs-"));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const service = new WorkflowJobService({
        repository: new FileWorkflowJobRepository(directory)
    });
    const job = await service.create("multi-review", { contentId: "draft" }, "review:draft");
    const completed = await service.update(job.id, {
        status: "COMPLETED",
        result: { decision: "REQUIRES_HUMAN_APPROVAL" }
    });
    assert.equal(completed.status, "COMPLETED");
    assert.equal(completed.result.decision, "REQUIRES_HUMAN_APPROVAL");
    assert.ok(completed.completedAt);
});
