const { z, ZodError } = require("zod");
const { LocalWorkerService, ARTIFACT_TYPES } = require("../services/localWorkerService");

const safeRelativePath = z.string().min(1).max(300).refine(value => (
    !value.includes("\\") &&
    !value.startsWith("/") &&
    !value.split("/").includes("..")
), "Ruta relativa inválida.");

const sourceSchema = z.object({
    relativePath: safeRelativePath,
    filename: z.string().min(1).max(255),
    byteSize: z.number().int().positive(),
    mimeType: z.enum([
        "video/mp4", "video/quicktime", "video/x-m4v",
        "video/x-matroska", "video/webm", "application/octet-stream"
    ]),
    checksumSha256: z.string().regex(/^[0-9a-f]{64}$/i).optional(),
    modifiedAt: z.string().datetime().optional()
}).strict();

const createJobSchema = z.object({
    type: z.enum(["video-processing", "clip-editing"]),
    source: sourceSchema.optional(),
    payload: z.record(z.string(), z.unknown()).default({})
}).strict().superRefine((value, context) => {
    if (value.type === "video-processing" && !value.source) {
        context.addIssue({
            code: "custom",
            path: ["source"],
            message: "El procesamiento de video requiere una fuente local."
        });
    }
});

const claimSchema = z.object({
    leaseSeconds: z.number().int().min(30).max(900).default(120),
    capabilities: z.array(z.enum(["ffmpeg", "ffprobe", "tus-upload"]))
        .max(10).default([])
}).strict();

const heartbeatSchema = z.object({
    leaseSeconds: z.number().int().min(30).max(900).default(120),
    progress: z.number().min(0).max(100).nullable().optional(),
    stage: z.string().min(1).max(80).nullable().optional()
}).strict();

const artifactTicketSchema = z.object({
    artifactType: z.enum(ARTIFACT_TYPES),
    filename: z.string().min(1).max(180),
    contentType: z.string().min(1).max(100),
    byteSize: z.number().int().positive(),
    checksumSha256: z.string().regex(/^[0-9a-f]{64}$/i),
    clipId: z.string().uuid().optional(),
    version: z.number().int().positive().optional(),
    style: z.string().min(1).max(80).optional()
}).strict();

const segmentSchema = z.object({
    index: z.number().int().nonnegative(),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
    status: z.enum(["QUEUED", "PROCESSING", "COMPLETED", "FAILED"]),
    analysis: z.record(z.string(), z.unknown()).default({})
}).strict().refine(value => value.endMs > value.startMs);

const momentSchema = z.object({
    analysisKey: z.string().min(1).max(200),
    type: z.string().min(1).max(80),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
    score: z.number().min(0).max(100),
    evidence: z.record(z.string(), z.unknown()).default({}),
    privacyStatus: z.string().max(80).default("PENDING_HUMAN_REVIEW")
}).strict().refine(value => value.endMs > value.startMs);

const clipSchema = z.object({
    id: z.string().uuid(),
    detectedMomentKey: z.string().min(1).max(200).nullable().optional(),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
    topic: z.string().max(500).nullable().optional(),
    hook: z.string().max(1000).nullable().optional(),
    onScreenText: z.string().max(1000).nullable().optional(),
    caption: z.string().max(4000).nullable().optional(),
    recommendedPlatforms: z.array(z.enum(["facebook", "instagram", "tiktok"]))
        .max(3).default([]),
    score: z.number().min(0).max(100).nullable().optional(),
    status: z.enum(["DETECTED", "DRAFT", "UNDER_REVIEW", "FAILED"]),
    fingerprint: z.string().min(1).max(200),
    privacyStatus: z.string().max(80).default("PENDING_HUMAN_REVIEW"),
    metadata: z.record(z.string(), z.unknown()).default({})
}).strict().refine(value => value.endMs > value.startMs);

const completedArtifactSchema = artifactTicketSchema.extend({
    storagePath: safeRelativePath
}).strict();

const completeSchema = z.object({
    source: sourceSchema.extend({
        durationMs: z.number().int().positive()
    }).omit({ relativePath: true, modifiedAt: true }).strict(),
    analysis: z.object({
        summary: z.record(z.string(), z.unknown()).default({}),
        segments: z.array(segmentSchema).max(500),
        moments: z.array(momentSchema).max(1000),
        clips: z.array(clipSchema).max(500)
    }).strict(),
    artifacts: z.array(completedArtifactSchema).max(1000).default([])
}).strict();

const failSchema = z.object({
    errorCode: z.string().min(1).max(100),
    errorMessage: z.string().min(1).max(2000),
    retryable: z.boolean().default(false)
}).strict();

function invalid(res, error) {
    if (!(error instanceof ZodError)) return false;
    res.status(422).json({
        ok: false,
        error: "INVALID_LOCAL_WORKER_REQUEST",
        issues: error.issues
    });
    return true;
}

function createLocalWorkerController(service = new LocalWorkerService()) {
    return {
        create: async (req, res, next) => {
            try {
                const job = await service.create(
                    req.localWorkerId,
                    createJobSchema.parse(req.body || {}),
                    req.get("idempotency-key") || ""
                );
                res.status(202).json({ ok: true, job });
            } catch (error) { if (!invalid(res, error)) next(error); }
        },
        claim: async (req, res, next) => {
            try {
                const job = await service.claim(
                    req.localWorkerId,
                    claimSchema.parse(req.body || {})
                );
                res.json({ ok: true, job });
            } catch (error) { if (!invalid(res, error)) next(error); }
        },
        heartbeat: async (req, res, next) => {
            try {
                const job = await service.heartbeat(
                    req.params.jobId,
                    req.localWorkerId,
                    heartbeatSchema.parse(req.body || {})
                );
                res.json({ ok: true, job });
            } catch (error) { if (!invalid(res, error)) next(error); }
        },
        ticket: async (req, res, next) => {
            try {
                const ticket = await service.createArtifactTicket(
                    req.params.jobId,
                    req.localWorkerId,
                    artifactTicketSchema.parse(req.body || {})
                );
                res.status(201).json({ ok: true, ticket });
            } catch (error) { if (!invalid(res, error)) next(error); }
        },
        complete: async (req, res, next) => {
            try {
                const job = await service.complete(
                    req.params.jobId,
                    req.localWorkerId,
                    completeSchema.parse(req.body || {})
                );
                res.json({ ok: true, job });
            } catch (error) { if (!invalid(res, error)) next(error); }
        },
        fail: async (req, res, next) => {
            try {
                const job = await service.fail(
                    req.params.jobId,
                    req.localWorkerId,
                    failSchema.parse(req.body || {})
                );
                res.json({ ok: true, job });
            } catch (error) { if (!invalid(res, error)) next(error); }
        }
    };
}

module.exports = {
    createLocalWorkerController,
    schemas: {
        createJobSchema,
        claimSchema,
        heartbeatSchema,
        artifactTicketSchema,
        completeSchema,
        failSchema
    }
};
