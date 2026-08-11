const crypto = require("crypto");
const { createWorkflowHandlers } = require("./workflowHandlers");

function retryableWorkflowError(error) {
    if (error?.retryable === false) return false;
    if (error?.retryable === true) return true;
    const status = Number(error?.statusCode || 0);
    if (status === 429 || status >= 500) return true;
    if (status >= 400 && status < 500) return false;
    return ![
        "INVALID_TREND_BATCH", "INVALID_SOCIAL_METRIC", "INVALID_AUTOMATION_PAYLOAD",
        "PRODUCT_NOT_FOUND", "PRODUCT_UNAVAILABLE", "CONTENT_NOT_FOUND",
        "CONTENT_NOT_WAITING_CORRECTION", "FAILED_REVIEW_REQUIRED"
    ].includes(error?.code);
}

class WorkflowJobRunner {
    constructor(service, options = {}) {
        this.service = service;
        this.handlers = options.handlers || createWorkflowHandlers(options);
        this.workerId = options.workerId || `content-worker-${crypto.randomUUID()}`;
        this.running = new Set();
        this.scheduled = new Set();
        this.retryBaseMs = Math.max(10, Number(options.retryBaseMs || 1000));
        this.maximumRetryMs = Math.max(this.retryBaseMs, Number(options.maximumRetryMs || 30_000));
        this.setTimer = options.setTimer || setTimeout;
    }

    async run(jobId) {
        if (this.running.has(jobId)) return this.service.get(jobId);
        this.running.add(jobId);
        let job;
        try {
            job = await this.service.get(jobId);
            if (["COMPLETED", "FAILED", "CANCELLED"].includes(job.status)) return job;
            if (job.executionTarget !== "backend") return job;
            if (
                job.status === "QUEUED" &&
                job.leaseExpiresAt &&
                Date.parse(job.leaseExpiresAt) > Date.now()
            ) return job;
            if (job.attempt >= job.maxAttempts) {
                return this.service.update(job.id, {
                    status: "FAILED",
                    attempt: job.attempt,
                    errorCode: job.errorCode || "WORKFLOW_MAX_ATTEMPTS_REACHED",
                    errorMessage: job.errorMessage || "Se agotaron los reintentos seguros.",
                    leaseExpiresAt: null,
                    retryable: false
                });
            }
            const attempt = job.attempt + 1;
            job = await this.service.update(job.id, {
                status: "RUNNING",
                attempt,
                leaseExpiresAt: null
            });
            const handler = this.handlers[job.type];
            if (!handler) throw Object.assign(new Error("No existe ejecutor para el flujo."), {
                code: "WORKFLOW_HANDLER_MISSING"
            });
            const result = await handler(job.payload, { job, workerId: this.workerId });
            return this.service.update(job.id, {
                status: "COMPLETED",
                attempt,
                result,
                leaseExpiresAt: null
            });
        } catch (error) {
            if (job) {
                const attempt = Math.max(1, Number(job.attempt || 0));
                const retryable = retryableWorkflowError(error) && attempt < job.maxAttempts;
                const delay = Math.min(
                    this.retryBaseMs * (2 ** Math.max(0, attempt - 1)),
                    this.maximumRetryMs
                );
                const nextAttemptAt = retryable
                    ? new Date(Date.now() + delay).toISOString()
                    : null;
                const updated = await this.service.update(job.id, {
                    status: retryable ? "QUEUED" : "FAILED",
                    attempt,
                    errorCode: error.code || "WORKFLOW_EXECUTION_FAILED",
                    errorMessage: error.message,
                    leaseExpiresAt: nextAttemptAt,
                    retryable
                });
                if (retryable) this.schedule(updated, delay);
            }
            if (!job || !retryableWorkflowError(error) || job.attempt >= job.maxAttempts) {
                throw error;
            }
            return this.service.get(job.id);
        } finally {
            this.running.delete(jobId);
        }
    }

    schedule(job, delay) {
        if (this.scheduled.has(job.id)) return false;
        this.scheduled.add(job.id);
        this.setTimer(() => {
            this.scheduled.delete(job.id);
            this.run(job.id).catch(error => {
                console.error("Workflow retry failed", {
                    jobId: job.id,
                    code: error.code || "WORKFLOW_EXECUTION_FAILED"
                });
            });
        }, Math.max(0, delay));
        return true;
    }

    resumeIfDue(job) {
        if (
            job?.executionTarget !== "backend" ||
            job.status !== "QUEUED" ||
            this.running.has(job.id) ||
            this.scheduled.has(job.id)
        ) return false;
        const delay = job.leaseExpiresAt
            ? Math.max(0, Date.parse(job.leaseExpiresAt) - Date.now())
            : 0;
        this.schedule(job, Math.min(delay, this.maximumRetryMs));
        return true;
    }

    async recover() {
        const jobs = await this.service.listByStatuses(["QUEUED", "RUNNING"]);
        const backendJobs = jobs.filter(job => job.executionTarget === "backend");
        for (const job of backendJobs) {
            if (job.status === "RUNNING") {
                await this.service.update(job.id, {
                    status: "QUEUED",
                    attempt: job.attempt,
                    errorCode: "WORKFLOW_INTERRUPTED",
                    errorMessage: "El proceso se reinició y el trabajo fue recuperado.",
                    leaseExpiresAt: null
                });
            }
            this.resumeIfDue({ ...job, status: "QUEUED", leaseExpiresAt: null });
        }
        return backendJobs.length;
    }
}

module.exports = {
    WorkflowJobRunner,
    retryableWorkflowError
};
