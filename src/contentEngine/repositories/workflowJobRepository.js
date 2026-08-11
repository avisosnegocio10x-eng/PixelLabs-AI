const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const {
    getSupabaseAdminClient,
    hasSupabaseConfiguration
} = require("../db/supabaseClient");
const {
    resolveExecutionTarget
} = require("../services/workflowExecutionPolicy");

function mapJob(row) {
    if (!row) return null;
    const type = row.workflow_type || row.type;
    return {
        id: row.id,
        type,
        executionTarget: resolveExecutionTarget(type),
        status: row.status,
        payload: row.payload || {},
        result: row.result || null,
        idempotencyKey: row.idempotency_key || row.idempotencyKey || null,
        attempt: row.attempt || 0,
        maxAttempts: row.max_attempts || row.maxAttempts || 3,
        errorCode: row.error_code || row.errorCode || null,
        errorMessage: row.error_message || row.errorMessage || null,
        lockedBy: row.locked_by || row.lockedBy || null,
        lockedAt: row.locked_at || row.lockedAt || null,
        leaseExpiresAt: row.next_attempt_at || row.leaseExpiresAt || null,
        createdAt: row.created_at || row.createdAt,
        updatedAt: row.updated_at || row.updatedAt,
        completedAt: row.completed_at || row.completedAt || null
    };
}

class FileWorkflowJobRepository {
    constructor(directory = path.resolve(
        process.env.CONTENT_ENGINE_WORK_DIR || "./storage/work",
        "workflow-jobs"
    )) {
        this.directory = directory;
    }

    async create(input) {
        await fs.mkdir(this.directory, { recursive: true });
        const now = new Date().toISOString();
        const job = mapJob({
            id: input.id || crypto.randomUUID(),
            type: input.type,
            status: "QUEUED",
            payload: input.payload || {},
            result: null,
            idempotencyKey: input.idempotencyKey || null,
            attempt: 0,
            maxAttempts: input.maxAttempts || 3,
            lockedBy: null,
            lockedAt: null,
            leaseExpiresAt: null,
            createdAt: now,
            updatedAt: now
        });
        await this.write(job);
        return job;
    }

    async write(job) {
        await fs.mkdir(this.directory, { recursive: true });
        const finalPath = path.join(this.directory, `${job.id}.json`);
        const temporaryPath = `${finalPath}.${process.pid}.tmp`;
        await fs.writeFile(temporaryPath, JSON.stringify(job, null, 2));
        await fs.rename(temporaryPath, finalPath);
        return job;
    }

    async get(id) {
        try {
            return mapJob(JSON.parse(
                await fs.readFile(path.join(this.directory, `${id}.json`), "utf8")
            ));
        } catch (error) {
            if (error.code === "ENOENT") return null;
            throw error;
        }
    }

    async findByIdempotencyKey(type, idempotencyKey) {
        try {
            const files = await fs.readdir(this.directory);
            for (const file of files) {
                if (!file.endsWith(".json")) continue;
                const job = mapJob(JSON.parse(
                    await fs.readFile(path.join(this.directory, file), "utf8")
                ));
                if (job.type === type && job.idempotencyKey === idempotencyKey) return job;
            }
            return null;
        } catch (error) {
            if (error.code === "ENOENT") return null;
            throw error;
        }
    }

    async update(id, changes) {
        const job = await this.get(id);
        if (!job) return null;
        const next = mapJob({ ...job, ...changes, updatedAt: new Date().toISOString() });
        await this.write(next);
        return next;
    }

    async listByStatuses(statuses) {
        try {
            const jobs = [];
            const files = await fs.readdir(this.directory);
            for (const file of files) {
                if (!file.endsWith(".json")) continue;
                const job = mapJob(JSON.parse(
                    await fs.readFile(path.join(this.directory, file), "utf8")
                ));
                if (statuses.includes(job.status)) jobs.push(job);
            }
            return jobs.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
        } catch (error) {
            if (error.code === "ENOENT") return [];
            throw error;
        }
    }

    async claim(id, workerId, leaseExpiresAt) {
        const job = await this.get(id);
        if (!job) return null;
        const now = Date.now();
        const eligible = job.status === "QUEUED"
            ? (!job.leaseExpiresAt || new Date(job.leaseExpiresAt).getTime() <= now)
            : job.status === "RUNNING" && job.leaseExpiresAt &&
                new Date(job.leaseExpiresAt).getTime() <= now;
        if (!eligible) return null;
        return this.update(id, {
            status: "RUNNING",
            lockedBy: workerId,
            lockedAt: new Date().toISOString(),
            leaseExpiresAt,
            attempt: job.attempt + 1,
            errorCode: null,
            errorMessage: null
        });
    }

    async recordEvent(input) {
        await fs.mkdir(this.directory, { recursive: true });
        const event = {
            at: new Date().toISOString(),
            actorType: "n8n",
            ...input
        };
        await fs.appendFile(
            path.join(this.directory, "workflow-events.jsonl"),
            `${JSON.stringify(event)}\n`,
            "utf8"
        );
        return event;
    }

    async recordFailure(input) {
        await fs.mkdir(this.directory, { recursive: true });
        const event = {
            at: new Date().toISOString(),
            ...input
        };
        await fs.appendFile(
            path.join(this.directory, "workflow-errors.jsonl"),
            `${JSON.stringify(event)}\n`,
            "utf8"
        );
        return event;
    }
}

class SupabaseWorkflowJobRepository {
    constructor(client = getSupabaseAdminClient()) {
        this.client = client;
    }

    async create(input) {
        const now = new Date().toISOString();
        const record = {
            id: input.id || crypto.randomUUID(),
            workflow_type: input.type,
            status: "QUEUED",
            payload: input.payload || {},
            idempotency_key: input.idempotencyKey || null,
            max_attempts: input.maxAttempts || 3,
            created_at: now,
            updated_at: now
        };
        const { data, error } = await this.client.from("workflow_jobs")
            .insert(record).select("*").single();
        if (error) {
            if (error.code === "23505" && input.idempotencyKey) {
                return this.findByIdempotencyKey(input.type, input.idempotencyKey);
            }
            throw new Error(`No se pudo crear el trabajo: ${error.message}`);
        }
        return mapJob(data);
    }

    async get(id) {
        const { data, error } = await this.client.from("workflow_jobs")
            .select("*").eq("id", id).maybeSingle();
        if (error) throw new Error(`No se pudo leer el trabajo: ${error.message}`);
        return mapJob(data);
    }

    async findByIdempotencyKey(type, idempotencyKey) {
        const { data, error } = await this.client.from("workflow_jobs")
            .select("*").eq("workflow_type", type)
            .eq("idempotency_key", idempotencyKey).maybeSingle();
        if (error) throw new Error(`No se pudo buscar el trabajo: ${error.message}`);
        return mapJob(data);
    }

    async update(id, changes) {
        const mapping = {
            type: "workflow_type",
            idempotencyKey: "idempotency_key",
            maxAttempts: "max_attempts",
            errorCode: "error_code",
            errorMessage: "error_message",
            lockedBy: "locked_by",
            lockedAt: "locked_at",
            leaseExpiresAt: "next_attempt_at",
            updatedAt: "updated_at",
            completedAt: "completed_at"
        };
        const update = {};
        for (const [key, value] of Object.entries(changes)) {
            update[mapping[key] || key] = value;
        }
        update.updated_at = new Date().toISOString();
        const { data, error } = await this.client.from("workflow_jobs")
            .update(update).eq("id", id).select("*").maybeSingle();
        if (error) throw new Error(`No se pudo actualizar el trabajo: ${error.message}`);
        return mapJob(data);
    }

    async listByStatuses(statuses) {
        const { data, error } = await this.client.from("workflow_jobs")
            .select("*").in("status", statuses).order("created_at", { ascending: true }).limit(250);
        if (error) throw new Error(`No se pudo consultar la cola: ${error.message}`);
        return (data || []).map(mapJob);
    }

    async claim(id, workerId, leaseExpiresAt) {
        const record = {
            status: "RUNNING",
            locked_by: workerId,
            locked_at: new Date().toISOString(),
            next_attempt_at: leaseExpiresAt,
            error_code: null,
            error_message: null,
            updated_at: new Date().toISOString()
        };

        let response = await this.client.from("workflow_jobs")
            .update(record)
            .eq("id", id)
            .eq("status", "QUEUED")
            .or(`next_attempt_at.is.null,next_attempt_at.lte.${new Date().toISOString()}`)
            .select("*")
            .maybeSingle();

        if (response.error) {
            throw new Error(`No se pudo reclamar el trabajo: ${response.error.message}`);
        }

        if (!response.data) {
            response = await this.client.from("workflow_jobs")
                .update(record)
                .eq("id", id)
                .eq("status", "RUNNING")
                .lte("next_attempt_at", new Date().toISOString())
                .select("*")
                .maybeSingle();
            if (response.error) {
                throw new Error(`No se pudo recuperar el trabajo: ${response.error.message}`);
            }
        }

        if (!response.data) return null;
        const attempt = Number(response.data.attempt || 0) + 1;
        const { data, error } = await this.client.from("workflow_jobs")
            .update({ attempt, updated_at: new Date().toISOString() })
            .eq("id", id)
            .eq("locked_by", workerId)
            .select("*")
            .maybeSingle();
        if (error) throw new Error(`No se pudo confirmar el arrendamiento: ${error.message}`);
        return mapJob(data);
    }

    async recordEvent(input) {
        const { error } = await this.client.from("audit_logs").insert({
            actor_type: "n8n",
            action: input.action,
            entity_type: "workflow_job",
            entity_id: input.jobId,
            before_data: input.before || null,
            after_data: input.after || null,
            request_id: input.idempotencyKey || null
        });
        if (error) throw new Error(`No se pudo registrar la ejecución: ${error.message}`);
    }

    async recordFailure(input) {
        const { error } = await this.client.from("content_errors").insert({
            entity_type: "workflow_job",
            entity_id: input.jobId,
            workflow: input.workflow,
            severity: "ERROR",
            error_code: input.errorCode || "WORKFLOW_EXECUTION_FAILED",
            message: String(input.errorMessage || "El flujo falló.").slice(0, 2000),
            safe_context: {
                attempt: input.attempt,
                maxAttempts: input.maxAttempts,
                executionTarget: input.executionTarget
            },
            retryable: input.retryable === true,
            retry_count: Math.max(0, Number(input.attempt || 1) - 1),
            next_retry_at: input.nextRetryAt || null
        });
        if (error) throw new Error(`No se pudo registrar el error: ${error.message}`);
    }
}

function createWorkflowJobRepository() {
    return hasSupabaseConfiguration()
        ? new SupabaseWorkflowJobRepository()
        : new FileWorkflowJobRepository();
}

module.exports = {
    FileWorkflowJobRepository,
    SupabaseWorkflowJobRepository,
    createWorkflowJobRepository,
    mapJob
};
