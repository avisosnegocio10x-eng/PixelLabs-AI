const { WorkflowJobService } = require("../services/workflowJobService");
const { WorkflowJobRunner } = require("../services/workflowJobRunner");

function createWorkflowJobController(
    service = new WorkflowJobService(),
    runner = new WorkflowJobRunner(service)
) {
    return {
        create: async (req, res, next) => {
            try {
                const job = await service.create(
                    req.params.workflow,
                    req.body || {},
                    req.get("idempotency-key") || ""
                );
                setImmediate(() => runner.run(job.id).catch(error => {
                    console.error("Workflow execution failed", {
                        jobId: job.id,
                        code: error.code || "WORKFLOW_EXECUTION_FAILED"
                    });
                }));
                res.status(202).json({ ok: true, job });
            } catch (error) {
                next(error);
            }
        },

        get: async (req, res, next) => {
            try {
                res.json({ ok: true, job: await service.get(req.params.jobId) });
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
        runner
    };
}

module.exports = {
    createWorkflowJobController
};
