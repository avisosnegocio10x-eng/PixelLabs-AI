const { WorkflowJobService } = require("../services/workflowJobService");
const { WorkflowJobRunner } = require("../services/workflowJobRunner");
const { AutomationReadinessService } = require("../services/automationReadinessService");
const {
    validateWorkflowPayload,
    validateIdempotencyKey,
    normalizeAutomationPayload
} = require("../services/workflowPayloadPolicy");

function createWorkflowJobController(
    service = new WorkflowJobService(),
    runner = new WorkflowJobRunner(service),
    options = {}
) {
    const readiness = options.readiness || new AutomationReadinessService();
    return {
        create: async (req, res, next) => {
            try {
                if (
                    options.requireWorkflowBinding &&
                    req.get("x-pixellabs-workflow") !== req.params.workflow
                ) {
                    throw Object.assign(new Error("El flujo no coincide con la ruta solicitada."), {
                        statusCode: 400,
                        code: "WORKFLOW_BINDING_MISMATCH"
                    });
                }
                const envelope = validateWorkflowPayload(req.body || {}, {
                    requireN8nSource: options.requireN8nSource
                });
                const payload = normalizeAutomationPayload(envelope);
                const idempotencyKey = validateIdempotencyKey(
                    req.get("idempotency-key"),
                    options.requireIdempotencyKey
                );
                const job = await service.create(
                    req.params.workflow,
                    payload,
                    idempotencyKey
                );
                if (job.executionTarget === "backend") {
                    setImmediate(() => runner.run(job.id).catch(error => {
                        console.error("Workflow execution failed", {
                            jobId: job.id,
                            code: error.code || "WORKFLOW_EXECUTION_FAILED"
                        });
                    }));
                }
                res.status(202).json({ ok: true, job });
            } catch (error) {
                next(error);
            }
        },

        get: async (req, res, next) => {
            try {
                const job = await service.get(req.params.jobId);
                runner.resumeIfDue(job);
                res.json({
                    ok: true,
                    job,
                    tracking: {
                        terminal: ["COMPLETED", "FAILED", "CANCELLED"].includes(job.status),
                        nextPollAfterSeconds: job.executionTarget === "local-video" ? 30 : 5
                    }
                });
            } catch (error) {
                next(error);
            }
        },

        update: async (req, res, next) => {
            try {
                res.json({
                    ok: true,
                    job: await service.update(req.params.jobId, req.body || {})
                });
            } catch (error) {
                next(error);
            }
        },
        readiness: async (req, res, next) => {
            try {
                res.json({ ok: true, ...(await readiness.check()) });
            } catch (error) { next(error); }
        },
        runner
    };
}

module.exports = {
    createWorkflowJobController
};
