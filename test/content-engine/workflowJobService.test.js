const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const {
    WorkflowJobService
} = require("../../src/contentEngine/services/workflowJobService");

test("crea trabajos idempotentes para los flujos de n8n", async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pixellabs-jobs-"));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const service = new WorkflowJobService({ directory });

    const first = await service.create("trend-research", { date: "2026-08-06" }, "daily-2026-08-06");
    const duplicate = await service.create("trend-research", { date: "changed" }, "daily-2026-08-06");

    assert.equal(first.id, duplicate.id);
    assert.equal(duplicate.payload.date, "2026-08-06");
});

test("rechaza tipos de flujo no registrados", async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pixellabs-jobs-"));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const service = new WorkflowJobService({ directory });

    await assert.rejects(
        () => service.create("publicar-sin-revision"),
        /Flujo desconocido/
    );
});
