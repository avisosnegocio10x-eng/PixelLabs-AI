const { createWorkflowJobRepository } = require("../repositories/workflowJobRepository");

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
        const update = {
            status: changes.status,
            result: changes.result || null,
            errorCode: changes.errorCode || null,
            errorMessage: changes.errorMessage || null,
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
}

module.exports = {
    WorkflowJobService,
    WORKFLOW_TYPES,
    WORKFLOW_STATUSES
};
