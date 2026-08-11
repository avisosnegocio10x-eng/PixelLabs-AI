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

test("reintenta errores transitorios sin duplicar el trabajo", async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pixellabs-retry-"));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const service = new WorkflowJobService({
        repository: new FileWorkflowJobRepository(directory)
    });
    let calls = 0;
    const timers = [];
    const runner = new WorkflowJobRunner(service, {
        retryBaseMs: 10,
        setTimer: callback => {
            timers.push(callback);
            return timers.length;
        },
        handlers: {
            "editorial-plan": async () => {
                calls += 1;
                if (calls === 1) {
                    throw Object.assign(new Error("Supabase temporalmente no disponible."), {
                        statusCode: 503,
                        code: "SUPABASE_TEMPORARY_FAILURE"
                    });
                }
                return { status: "PLAN_READY" };
            }
        }
    });
    const job = await service.create("editorial-plan", {}, "editorial-plan:retry-test");
    const queued = await runner.run(job.id);
    assert.equal(queued.status, "QUEUED");
    assert.equal(queued.attempt, 1);
    assert.equal(timers.length, 1);
    const retryLog = await fs.readFile(path.join(directory, "workflow-errors.jsonl"), "utf8");
    assert.match(retryLog, /SUPABASE_TEMPORARY_FAILURE/);
    assert.match(retryLog, /"retryable":true/);
    assert.doesNotMatch(retryLog, /payload/);
    await new Promise(resolve => setTimeout(resolve, 15));
    timers.shift()();
    let completed = await service.get(job.id);
    for (let index = 0; index < 50 && completed.status !== "COMPLETED"; index += 1) {
        await new Promise(resolve => setTimeout(resolve, 5));
        completed = await service.get(job.id);
    }
    assert.equal(completed.status, "COMPLETED");
    assert.equal(completed.attempt, 2);
    assert.equal(calls, 2);
});

test("no reintenta errores funcionales de validación", async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pixellabs-no-retry-"));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const service = new WorkflowJobService({
        repository: new FileWorkflowJobRepository(directory)
    });
    const runner = new WorkflowJobRunner(service, {
        handlers: {
            "editorial-plan": async () => {
                throw Object.assign(new Error("Payload inválido."), {
                    statusCode: 422,
                    code: "INVALID_AUTOMATION_PAYLOAD"
                });
            }
        }
    });
    const job = await service.create("editorial-plan", {}, "editorial-plan:no-retry");
    await assert.rejects(() => runner.run(job.id), /Payload inválido/);
    const failed = await service.get(job.id);
    assert.equal(failed.status, "FAILED");
    assert.equal(failed.attempt, 1);
    const errorLog = await fs.readFile(path.join(directory, "workflow-errors.jsonl"), "utf8");
    assert.match(errorLog, /INVALID_AUTOMATION_PAYLOAD/);
    assert.match(errorLog, /"retryable":false/);
});
