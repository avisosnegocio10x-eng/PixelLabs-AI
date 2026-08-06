const { WorkflowJobService } = require("../services/workflowJobService");

function createWorkflowJobController(service = new WorkflowJobService()) {
    return {
        create: async (req, res, next) => {
            try {
                const job = await service.create(
                    req.params.workflow,
                    req.body || {},
                    req.get("idempotency-key") || ""
                );
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
        }
    };
}

module.exports = {
    createWorkflowJobController
};
