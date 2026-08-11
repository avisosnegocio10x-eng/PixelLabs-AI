const crypto = require("crypto");
const path = require("path");
const { WorkflowJobService } = require("./workflowJobService");
const { getSupabaseAdminClient } = require("../db/supabaseClient");
const { VideoRepository } = require("../repositories/videoRepository");

const ARTIFACT_TYPES = Object.freeze([
    "clip-video",
    "cover",
    "subtitle"
]);

const CONTENT_TYPES = Object.freeze({
    "clip-video": new Set(["video/mp4", "video/webm"]),
    cover: new Set(["image/jpeg", "image/png", "image/webp"]),
    subtitle: new Set(["text/vtt"])
});

function sanitizeArtifactFilename(filename) {
    return path.basename(filename)
        .normalize("NFKC")
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .replace(/_+/g, "_")
        .slice(0, 140);
}

function storageEndpointFromProjectUrl(projectUrl) {
    const url = new URL(projectUrl);
    if (!/\.supabase\.(co|in|red)$/i.test(url.hostname)) {
        throw Object.assign(new Error("La URL de Supabase no admite Storage directo."), {
            statusCode: 503,
            code: "SUPABASE_STORAGE_URL_INVALID"
        });
    }
    url.hostname = url.hostname.replace(/\.supabase\./i, ".storage.supabase.");
    url.pathname = "/storage/v1/upload/resumable";
    url.search = "";
    url.hash = "";
    return url.toString();
}

class LocalWorkerService {
    constructor(options = {}) {
        this.jobs = options.jobs || new WorkflowJobService(options);
        this.client = options.client === undefined
            ? getSupabaseAdminClient()
            : options.client;
        this.videoRepository = options.videoRepository || new VideoRepository(this.client);
        this.bucket = options.bucket || process.env.SUPABASE_STORAGE_BUCKET || "pixellabs-content";
        this.maxArtifactBytes = Number(
            options.maxArtifactBytes ||
            process.env.LOCAL_WORKER_MAX_ARTIFACT_BYTES ||
            48 * 1024 * 1024
        );
    }

    async create(workerId, input, idempotencyKey = "") {
        if (this.jobs.targetFor(input.type) !== "local-video") {
            throw Object.assign(new Error("El tipo de trabajo no pertenece al agente local."), {
                statusCode: 422,
                code: "WORKER_JOB_TYPE_NOT_ALLOWED"
            });
        }
        const payload = {
            ...input.payload,
            workerId,
            source: input.source || null,
            requestedAt: new Date().toISOString()
        };
        const stableKey = idempotencyKey || crypto.createHash("sha256")
            .update(JSON.stringify({ workerId, type: input.type, source: input.source }))
            .digest("hex");
        return this.jobs.create(input.type, payload, stableKey);
    }

    async claim(workerId, input = {}) {
        const capabilities = new Set(input.capabilities || []);
        if (!capabilities.has("ffmpeg") || !capabilities.has("ffprobe")) {
            throw Object.assign(new Error("El agente no declaró FFmpeg y ffprobe."), {
                statusCode: 422,
                code: "WORKER_CAPABILITIES_REQUIRED"
            });
        }
        return this.jobs.claimNext(workerId, input);
    }

    async heartbeat(jobId, workerId, input) {
        return this.jobs.heartbeat(jobId, workerId, input);
    }

    async createArtifactTicket(jobId, workerId, artifact) {
        await this.jobs.requireWorkerLease(jobId, workerId);
        if (!this.client || !process.env.SUPABASE_URL) {
            throw Object.assign(new Error("Supabase Storage no está configurado."), {
                statusCode: 503,
                code: "STORAGE_NOT_CONFIGURED"
            });
        }
        if (!ARTIFACT_TYPES.includes(artifact.artifactType)) {
            throw Object.assign(new Error("Tipo de artefacto inválido."), {
                statusCode: 422,
                code: "INVALID_ARTIFACT_TYPE"
            });
        }
        if (!CONTENT_TYPES[artifact.artifactType].has(artifact.contentType)) {
            throw Object.assign(new Error("Content-Type de artefacto inválido."), {
                statusCode: 415,
                code: "INVALID_ARTIFACT_CONTENT_TYPE"
            });
        }
        if (artifact.byteSize > this.maxArtifactBytes) {
            throw Object.assign(new Error("El artefacto supera el límite de Supabase."), {
                statusCode: 413,
                code: "ARTIFACT_TOO_LARGE"
            });
        }

        const filename = sanitizeArtifactFilename(artifact.filename);
        const storagePath = [
            "local-worker",
            jobId,
            `${crypto.randomUUID()}-${filename}`
        ].join("/");
        const { data, error } = await this.client.storage
            .from(this.bucket)
            .createSignedUploadUrl(storagePath);
        if (error) {
            throw Object.assign(new Error(`No se pudo crear la subida firmada: ${error.message}`), {
                statusCode: 503,
                code: "SIGNED_UPLOAD_FAILED"
            });
        }

        return {
            bucket: this.bucket,
            storagePath,
            token: data.token,
            resumableEndpoint: storageEndpointFromProjectUrl(process.env.SUPABASE_URL),
            expiresInSeconds: 7200,
            maxBytes: this.maxArtifactBytes
        };
    }

    async verifyArtifacts(jobId, artifacts) {
        if (!artifacts.length) return;
        if (!this.client) {
            throw Object.assign(new Error("Supabase Storage no está configurado."), {
                statusCode: 503,
                code: "STORAGE_NOT_CONFIGURED"
            });
        }
        const prefix = `local-worker/${jobId}/`;
        for (const artifact of artifacts) {
            if (
                !ARTIFACT_TYPES.includes(artifact.artifactType) ||
                !CONTENT_TYPES[artifact.artifactType]?.has(artifact.contentType) ||
                artifact.byteSize > this.maxArtifactBytes
            ) {
                throw Object.assign(new Error("Metadatos de artefacto inválidos."), {
                    statusCode: 422,
                    code: "INVALID_COMPLETED_ARTIFACT"
                });
            }
            if (!artifact.storagePath.startsWith(prefix)) {
                throw Object.assign(new Error("Ruta de artefacto fuera del trabajo."), {
                    statusCode: 422,
                    code: "ARTIFACT_PATH_MISMATCH"
                });
            }
            const { data, error } = await this.client.storage
                .from(this.bucket)
                .info(artifact.storagePath);
            if (error || !data) {
                throw Object.assign(new Error("El artefacto no existe en Storage."), {
                    statusCode: 409,
                    code: "ARTIFACT_NOT_UPLOADED"
                });
            }
            const actualSize = Number(data.size ?? data.metadata?.size ?? -1);
            if (actualSize >= 0 && actualSize !== artifact.byteSize) {
                throw Object.assign(new Error("El tamaño del artefacto no coincide."), {
                    statusCode: 409,
                    code: "ARTIFACT_SIZE_MISMATCH"
                });
            }
        }
    }

    async complete(jobId, workerId, result) {
        const job = await this.jobs.requireWorkerLease(jobId, workerId);
        await this.verifyArtifacts(jobId, result.artifacts || []);
        await this.videoRepository.syncRemoteResult?.(
            job,
            result,
            workerId,
            this.bucket
        );
        return this.jobs.completeFromWorker(jobId, workerId, {
            ...result,
            workerId,
            completedAt: new Date().toISOString(),
            autoPublish: false,
            requiresHumanApproval: true
        });
    }

    async fail(jobId, workerId, input) {
        return this.jobs.failFromWorker(jobId, workerId, input);
    }
}

module.exports = {
    ARTIFACT_TYPES,
    CONTENT_TYPES,
    LocalWorkerService,
    sanitizeArtifactFilename,
    storageEndpointFromProjectUrl
};
