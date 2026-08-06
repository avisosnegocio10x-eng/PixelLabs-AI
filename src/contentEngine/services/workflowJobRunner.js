const crypto = require("crypto");
const { createWorkflowHandlers } = require("./workflowHandlers");

class WorkflowJobRunner {
    constructor(service, options = {}) {
        this.service = service;
        this.handlers = options.handlers || createWorkflowHandlers(options);
        this.workerId = options.workerId || `content-worker-${crypto.randomUUID()}`;
        this.running = new Set();
    }

    async run(jobId) {
        if (this.running.has(jobId)) return this.service.get(jobId);
        this.running.add(jobId);
        let job;
        try {
            job = await this.service.get(jobId);
            if (["COMPLETED", "FAILED", "CANCELLED"].includes(job.status)) return job;
            const attempt = job.attempt + 1;
            await this.service.update(job.id, { status: "RUNNING", attempt });
            const handler = this.handlers[job.type];
            if (!handler) throw Object.assign(new Error("No existe ejecutor para el flujo."), {
                code: "WORKFLOW_HANDLER_MISSING"
            });
            const result = await handler(job.payload, { job, workerId: this.workerId });
            return this.service.update(job.id, {
                status: "COMPLETED",
                attempt,
                result
            });
        } catch (error) {
            if (job) {
                await this.service.update(job.id, {
                    status: "FAILED",
                    attempt: job.attempt + 1,
                    errorCode: error.code || "WORKFLOW_EXECUTION_FAILED",
                    errorMessage: error.message
                });
            }
            throw error;
        } finally {
            this.running.delete(jobId);
        }
    }

    async recover() {
        const jobs = await this.service.listByStatuses(["QUEUED", "RUNNING"]);
        for (const job of jobs) {
            setImmediate(() => this.run(job.id).catch(error => {
                console.error("Workflow recovery failed", {
                    jobId: job.id,
                    code: error.code || "WORKFLOW_EXECUTION_FAILED"
                });
            }));
        }
        return jobs.length;
    }
}

module.exports = {
    WorkflowJobRunner
};
