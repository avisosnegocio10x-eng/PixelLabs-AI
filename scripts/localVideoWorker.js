#!/usr/bin/env node
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const dotenv = require("dotenv");
const tus = require("tus-js-client");
const { LocalVideoProcessor } = require("../src/contentEngine/video/localVideoProcessor");
const { discoverLocalVideos } = require("../src/contentEngine/video/localSourcePolicy");

dotenv.config({
    path: process.env.LOCAL_WORKER_ENV_FILE || path.resolve("local-worker/.env"),
    quiet: true
});

function workerIdDefault() {
    const hostname = os.hostname().replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 50);
    return `pixellabs-${hostname || "pc"}`;
}

function validateConfiguration() {
    const apiUrl = new URL(process.env.LOCAL_WORKER_API_URL || "");
    const localHost = ["localhost", "127.0.0.1", "::1"].includes(apiUrl.hostname);
    if (apiUrl.protocol !== "https:" && !(localHost && apiUrl.protocol === "http:")) {
        throw new Error("LOCAL_WORKER_API_URL debe usar HTTPS fuera de localhost.");
    }
    if (!process.env.LOCAL_WORKER_API_TOKEN) {
        throw new Error("Configura LOCAL_WORKER_API_TOKEN en local-worker/.env.");
    }
    return {
        apiUrl: apiUrl.toString().replace(/\/$/, ""),
        token: process.env.LOCAL_WORKER_API_TOKEN,
        workerId: process.env.LOCAL_WORKER_ID || workerIdDefault(),
        inboxRoot: path.resolve(process.env.LOCAL_WORKER_INBOX_DIR || "./local-worker/inbox"),
        workRoot: path.resolve(process.env.LOCAL_WORKER_WORK_DIR || "./local-worker/work"),
        pollMs: Math.max(2000, Number(process.env.LOCAL_WORKER_POLL_MS || 5000))
    };
}

class WorkerApi {
    constructor(config) {
        this.config = config;
    }

    async request(endpoint, options = {}) {
        const response = await fetch(`${this.config.apiUrl}/worker${endpoint}`, {
            method: options.method || "POST",
            headers: {
                authorization: `Bearer ${this.config.token}`,
                "x-worker-id": this.config.workerId,
                "content-type": "application/json",
                ...(options.headers || {})
            },
            body: options.body === undefined ? undefined : JSON.stringify(options.body),
            signal: AbortSignal.timeout(options.timeoutMs || 30_000)
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(data.message || data.error || `HTTP ${response.status}`);
            error.code = data.error || "WORKER_API_ERROR";
            error.statusCode = response.status;
            throw error;
        }
        return data;
    }

    async register(source) {
        const key = crypto.createHash("sha256").update(JSON.stringify({
            workerId: this.config.workerId,
            relativePath: source.relativePath,
            byteSize: source.byteSize,
            modifiedAt: source.modifiedAt
        })).digest("hex");
        return this.request("/jobs", {
            headers: { "idempotency-key": key },
            body: {
                type: "video-processing",
                source: {
                    relativePath: source.relativePath,
                    filename: source.filename,
                    byteSize: source.byteSize,
                    mimeType: source.mimeType,
                    modifiedAt: source.modifiedAt
                },
                payload: { origin: "local-inbox" }
            }
        });
    }

    claim() {
        return this.request("/jobs/claim", {
            body: {
                leaseSeconds: 180,
                capabilities: ["ffmpeg", "ffprobe", "tus-upload"]
            }
        });
    }

    heartbeat(jobId, progress) {
        return this.request(`/jobs/${jobId}/heartbeat`, {
            body: { leaseSeconds: 180, ...progress }
        });
    }

    ticket(jobId, artifact) {
        const { localPath, ...metadata } = artifact;
        return this.request(`/jobs/${jobId}/artifacts/ticket`, { body: metadata });
    }

    complete(jobId, result) {
        return this.request(`/jobs/${jobId}/complete`, {
            body: result,
            timeoutMs: 120_000
        });
    }

    fail(jobId, error, retryable) {
        return this.request(`/jobs/${jobId}/fail`, {
            body: {
                errorCode: error.code || "LOCAL_VIDEO_PROCESSING_FAILED",
                errorMessage: String(error.message || error).slice(0, 2000),
                retryable
            }
        });
    }
}

function uploadWithTus(ticket, artifact, onProgress) {
    return new Promise((resolve, reject) => {
        const stream = fs.createReadStream(artifact.localPath);
        const upload = new tus.Upload(stream, {
            endpoint: ticket.resumableEndpoint,
            retryDelays: [0, 3000, 5000, 10000, 20000],
            headers: {
                "x-signature": ticket.token,
                "x-upsert": "false"
            },
            metadata: {
                bucketName: ticket.bucket,
                objectName: ticket.storagePath,
                contentType: artifact.contentType
            },
            uploadDataDuringCreation: true,
            removeFingerprintOnSuccess: true,
            chunkSize: 6 * 1024 * 1024,
            uploadSize: artifact.byteSize,
            onError: reject,
            onProgress: (uploaded, total) => onProgress?.(uploaded, total),
            onSuccess: resolve
        });
        upload.start();
    });
}

async function registerInbox(api, config) {
    const videos = await discoverLocalVideos(config.inboxRoot);
    for (const video of videos) {
        await api.register(video);
    }
    return videos.length;
}

function isRetryable(error) {
    return ![
        "LOCAL_SOURCE_CHANGED",
        "LOCAL_SOURCE_CHECKSUM_MISMATCH",
        "INVALID_VIDEO",
        "LOCAL_SOURCE_REQUIRED"
    ].includes(error.code);
}

async function processClaim(api, processor, job) {
    let currentProgress = { progress: 0, stage: "CLAIMED" };
    const heartbeat = setInterval(() => {
        api.heartbeat(job.id, currentProgress).catch(error => {
            console.error("No se pudo renovar el trabajo", { code: error.code || "HEARTBEAT_FAILED" });
        });
    }, 45_000);
    heartbeat.unref();
    try {
        const localResult = await processor.process(job, {
            onProgress: async progress => {
                currentProgress = progress;
                await api.heartbeat(job.id, progress);
            }
        });
        const artifacts = [];
        for (let index = 0; index < localResult.artifacts.length; index += 1) {
            const artifact = localResult.artifacts[index];
            currentProgress = {
                progress: 94 + Math.floor((index / Math.max(1, localResult.artifacts.length)) * 5),
                stage: "UPLOADING_ARTIFACTS"
            };
            const { ticket } = await api.ticket(job.id, artifact);
            await uploadWithTus(ticket, artifact);
            const { localPath, ...metadata } = artifact;
            artifacts.push({ ...metadata, storagePath: ticket.storagePath });
        }
        await api.complete(job.id, {
            source: localResult.source,
            analysis: localResult.analysis,
            artifacts
        });
        console.log("Trabajo completado", { jobId: job.id, clips: localResult.analysis.clips.length });
    } catch (error) {
        console.error("Trabajo fallido", { jobId: job.id, code: error.code || "LOCAL_WORKER_FAILED" });
        await api.fail(job.id, error, isRetryable(error)).catch(failError => {
            console.error("No se pudo registrar el fallo", { code: failError.code || "FAIL_REPORT_FAILED" });
        });
    } finally {
        clearInterval(heartbeat);
    }
}

async function main() {
    const config = validateConfiguration();
    const api = new WorkerApi(config);
    const processor = new LocalVideoProcessor({
        inboxRoot: config.inboxRoot,
        workRoot: config.workRoot
    });
    let stopping = false;
    process.once("SIGINT", () => { stopping = true; });
    process.once("SIGTERM", () => { stopping = true; });

    console.log("Agente local iniciado", {
        workerId: config.workerId,
        inbox: config.inboxRoot,
        autoPublish: false
    });

    while (!stopping) {
        try {
            await registerInbox(api, config);
            const { job } = await api.claim();
            if (job) {
                await processClaim(api, processor, job);
                continue;
            }
        } catch (error) {
            console.error("Ciclo del agente local falló", { code: error.code || "LOCAL_WORKER_LOOP_FAILED" });
        }
        await new Promise(resolve => setTimeout(resolve, config.pollMs));
    }
    console.log("Agente local detenido de forma segura.");
}

if (require.main === module) {
    main().catch(error => {
        console.error("No se pudo iniciar el agente local", error.message);
        process.exitCode = 1;
    });
}

module.exports = {
    WorkerApi,
    uploadWithTus,
    registerInbox,
    processClaim,
    validateConfiguration,
    workerIdDefault
};
