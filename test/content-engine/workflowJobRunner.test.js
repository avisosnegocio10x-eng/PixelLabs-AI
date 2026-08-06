const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { WorkflowJobService } = require("../../src/contentEngine/services/workflowJobService");
const { WorkflowJobRunner } = require("../../src/contentEngine/services/workflowJobRunner");
const { FileWorkflowJobRepository } = require("../../src/contentEngine/repositories/workflowJobRepository");

test("el worker consume la cola y registra un resultado persistente", async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pixellabs-runner-"));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const service = new WorkflowJobService({
        repository: new FileWorkflowJobRepository(directory)
    });
    const runner = new WorkflowJobRunner(service, {
        handlers: {
            "editorial-plan": async payload => ({ status: "PLAN_READY", payload })
        }
    });
    const job = await service.create("editorial-plan", { day: "today" }, "plan:today");
    const completed = await runner.run(job.id);
    assert.equal(completed.status, "COMPLETED");
    assert.equal(completed.result.status, "PLAN_READY");
    assert.equal((await service.get(job.id)).attempt, 1);
});

test("publicación programada queda bloqueada con aprobación manual", async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pixellabs-runner-"));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const service = new WorkflowJobService({
        repository: new FileWorkflowJobRepository(path.join(directory, "jobs"))
    });
    const runner = new WorkflowJobRunner(service, {
        catalog: { list: async () => [] },
        settings: {
            getSettings: async () => ({
                enabled: true,
                autoPublish: false,
                approvalMode: "manual",
                maxCorrectionAttempts: 3
            })
        }
    });
    const job = await service.create("schedule-publish", {}, "publish:test");
    const completed = await runner.run(job.id);
    assert.deepEqual(completed.result, {
        status: "BLOCKED",
        reason: "AUTO_PUBLISH_DISABLED",
        externalRequestsSent: 0
    });
});
