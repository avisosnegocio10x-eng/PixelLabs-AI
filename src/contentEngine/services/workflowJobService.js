const { createWorkflowJobRepository } = require("../repositories/workflowJobRepository");
const {
    resolveExecutionTarget
} = require("./workflowExecutionPolicy");

const WORKFLOW_TYPES = Object.freeze([
    "trend-research",
    "editorial-plan",
    "content-generation",
    "video-processing",
    "clip-editing",
    "multi-review",
    "content-correction",
    "approval-routing",
    "schedule-publish",
    "metrics-sync",
    "weekly-optimization",
    "error-recovery"
]);

const WORKFLOW_STATUSES = Object.freeze([
    "QUEUED", "RUNNING", "PAUSED", "COMPLETED", "FAILED", "CANCELLED"
]);

class WorkflowJobService {
    constructor(options = {}) {
        this.repository = options.repository || createWorkflowJobRepository();
    }

    assertType(type) {
        if (!WORKFLOW_TYPES.includes(type)) {
            throw Object.assign(new Error("Flujo desconocido."), {
                statusCode: 404,
                code: "UNKNOWN_WORKFLOW"
            });
        }
    }

    assertId(id) {
        if (!/^[0-9a-f-]{36}$/i.test(id)) {
            throw Object.assign(new Error("ID de trabajo inválido."), {
                statusCode: 400,
                code: "INVALID_JOB_ID"
            });
        }
    }

    async create(type, payload = {}, idempotencyKey = "") {
        this.assertType(type);
        if (idempotencyKey) {
            const existing = await this.repository.findByIdempotencyKey(type, idempotencyKey);
            if (existing) return existing;
        }
        return this.repository.create({
            type,
            payload,
            idempotencyKey: idempotencyKey || null,
            maxAttempts: 3
        });
    }

    async get(id) {
        this.assertId(id);
        const job = await this.repository.get(id);
        if (!job) {
            throw Object.assign(new Error("Trabajo no encontrado."), {
                statusCode: 404,
                code: "JOB_NOT_FOUND"
            });
        }
        return job;
    }

    async update(id, changes = {}) {
        this.assertId(id);
        if (!WORKFLOW_STATUSES.includes(changes.status)) {
            throw Object.assign(new Error("Estado de trabajo inválido."), {
                statusCode: 422,
                code: "INVALID_JOB_STATUS"
            });
        }
        const current = await this.get(id);
        if (current.executionTarget === "local-video" && !changes.workerAuthorized) {
            throw Object.assign(new Error("El trabajo pertenece al agente local."), {
                statusCode: 409,
                code: "LOCAL_WORKER_OWNS_JOB"
            });
        }
        const update = {
            status: changes.status,
            result: changes.result === undefined ? current.result : changes.result,
            errorCode: changes.errorCode === undefined ? current.errorCode : changes.errorCode,
            errorMessage: changes.errorMessage === undefined
                ? current.errorMessage
                : changes.errorMessage,
            attempt: Number.isInteger(changes.attempt) ? changes.attempt : current.attempt
        };
        if (["COMPLETED", "FAILED", "CANCELLED"].includes(changes.status)) {
            update.completedAt = new Date().toISOString();
        }
        return this.repository.update(id, update);
    }

    async listByStatuses(statuses) {
        for (const status of statuses) {
            if (!WORKFLOW_STATUSES.includes(status)) {
                throw Object.assign(new Error("Estado de trabajo inválido."), {
                    statusCode: 422,
                    code: "INVALID_JOB_STATUS"
                });
            }
        }
        return this.repository.listByStatuses(statuses);
    }

    async claimNext(workerId, options = {}) {
        const leaseSeconds = Math.max(30, Math.min(
            Number(options.leaseSeconds || 120),
            900
        ));
        const now = Date.now();
        const jobs = await this.repository.listByStatuses(["QUEUED", "RUNNING"]);
        const candidates = jobs.filter(job => {
            if (job.executionTarget !== "local-video") return false;
            const assignedWorker = job.payload?.workerId;
            if (assignedWorker && assignedWorker !== workerId) return false;
            const due = !job.leaseExpiresAt || new Date(job.leaseExpiresAt).getTime() <= now;
            return job.status === "QUEUED" ? due : due && Boolean(job.lockedBy);
        });

        for (const job of candidates) {
            const claimed = await this.repository.claim(
                job.id,
                workerId,
                new Date(Date.now() + leaseSeconds * 1000).toISOString()
            );
            if (claimed) return claimed;
        }
        return null;
    }

    async requireWorkerLease(id, workerId) {
        const job = await this.get(id);
        const leaseActive = job.leaseExpiresAt &&
            new Date(job.leaseExpiresAt).getTime() > Date.now();
        if (
            job.executionTarget !== "local-video" ||
            job.status !== "RUNNING" ||
            job.lockedBy !== workerId ||
            !leaseActive
        ) {
            throw Object.assign(new Error("El agente no posee este trabajo."), {
                statusCode: 409,
                code: "WORKER_LEASE_MISMATCH"
            });
        }
        return job;
    }

    async heartbeat(id, workerId, input = {}) {
        const job = await this.requireWorkerLease(id, workerId);
        const leaseSeconds = Math.max(30, Math.min(
            Number(input.leaseSeconds || 120),
            900
        ));
        return this.repository.update(id, {
            status: "RUNNING",
            lockedBy: workerId,
            leaseExpiresAt: new Date(Date.now() + leaseSeconds * 1000).toISOString(),
            result: {
                ...(job.result || {}),
                progress: Number.isFinite(input.progress) ? input.progress : null,
                stage: input.stage || null,
                heartbeatAt: new Date().toISOString()
            }
        });
    }

    async completeFromWorker(id, workerId, result) {
        const job = await this.requireWorkerLease(id, workerId);
        return this.repository.update(id, {
            status: "COMPLETED",
            result,
            errorCode: null,
            errorMessage: null,
            lockedBy: null,
            lockedAt: null,
            leaseExpiresAt: null,
            completedAt: new Date().toISOString(),
            attempt: job.attempt
        });
    }

    async failFromWorker(id, workerId, input = {}) {
        const job = await this.requireWorkerLease(id, workerId);
        const retryable = input.retryable === true && job.attempt < job.maxAttempts;
        return this.repository.update(id, {
            status: retryable ? "QUEUED" : "FAILED",
            result: job.result,
            errorCode: input.errorCode || "LOCAL_VIDEO_PROCESSING_FAILED",
            errorMessage: input.errorMessage || "El agente local no pudo completar el trabajo.",
            lockedBy: null,
            lockedAt: null,
            leaseExpiresAt: retryable
                ? new Date(Date.now() + Math.min(job.attempt * 30_000, 300_000)).toISOString()
                : null,
            completedAt: retryable ? null : new Date().toISOString(),
            attempt: job.attempt
        });
    }

    targetFor(type) {
        this.assertType(type);
        return resolveExecutionTarget(type);
    }
}

module.exports = {
    WorkflowJobService,
    WORKFLOW_TYPES,
    WORKFLOW_STATUSES
};
