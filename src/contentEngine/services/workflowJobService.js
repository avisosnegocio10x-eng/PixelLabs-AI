const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

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

class WorkflowJobService {
    constructor(options = {}) {
        this.directory = path.resolve(
            options.directory ||
            process.env.CONTENT_ENGINE_WORK_DIR ||
            "./storage/work",
            "workflow-jobs"
        );
    }

    assertType(type) {
        if (!WORKFLOW_TYPES.includes(type)) {
            throw Object.assign(new Error("Flujo desconocido."), {
                statusCode: 404,
                code: "UNKNOWN_WORKFLOW"
            });
        }
    }

    async create(type, payload = {}, idempotencyKey = "") {
        this.assertType(type);
        await fs.mkdir(this.directory, { recursive: true });

        if (idempotencyKey) {
            const existing = await this.findByIdempotencyKey(type, idempotencyKey);
            if (existing) return existing;
        }

        const now = new Date().toISOString();
        const job = {
            id: crypto.randomUUID(),
            type,
            status: "QUEUED",
            payload,
            idempotencyKey: idempotencyKey || null,
            attempt: 0,
            createdAt: now,
            updatedAt: now
        };

        await this.write(job);
        return job;
    }

    async write(job) {
        const finalPath = path.join(this.directory, `${job.id}.json`);
        const temporaryPath = `${finalPath}.${process.pid}.tmp`;
        await fs.writeFile(temporaryPath, JSON.stringify(job, null, 2));
        await fs.rename(temporaryPath, finalPath);
        return job;
    }

    async get(id) {
        if (!/^[0-9a-f-]{36}$/i.test(id)) {
            throw Object.assign(new Error("ID de trabajo inválido."), {
                statusCode: 400,
                code: "INVALID_JOB_ID"
            });
        }

        try {
            return JSON.parse(
                await fs.readFile(path.join(this.directory, `${id}.json`), "utf8")
            );
        } catch (error) {
            if (error.code === "ENOENT") {
                throw Object.assign(new Error("Trabajo no encontrado."), {
                    statusCode: 404,
                    code: "JOB_NOT_FOUND"
                });
            }
            throw error;
        }
    }

    async findByIdempotencyKey(type, idempotencyKey) {
        try {
            const files = await fs.readdir(this.directory);
            for (const file of files) {
                if (!file.endsWith(".json")) continue;
                const job = JSON.parse(
                    await fs.readFile(path.join(this.directory, file), "utf8")
                );
                if (job.type === type && job.idempotencyKey === idempotencyKey) {
                    return job;
                }
            }
            return null;
        } catch (error) {
            if (error.code === "ENOENT") return null;
            throw error;
        }
    }
}

module.exports = {
    WorkflowJobService,
    WORKFLOW_TYPES
};
