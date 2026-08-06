const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { z } = require("zod");
const {
    parseContentRange,
    mergeRanges,
    coveredBytes,
    isComplete
} = require("./contentRange");
const { probeVideo } = require("./mediaProbe");
const { sha256File } = require("./checksum");
const { VideoRepository } = require("../repositories/videoRepository");

const allowedExtensions = new Set([".mp4", ".mov", ".m4v", ".mkv", ".webm"]);
const allowedMimeTypes = new Set([
    "video/mp4",
    "video/quicktime",
    "video/x-m4v",
    "video/x-matroska",
    "video/webm",
    "application/octet-stream"
]);

const createUploadSchema = z.object({
    filename: z.string().min(1).max(255),
    totalBytes: z.number().int().positive(),
    mimeType: z.string().min(1).max(100)
}).strict();

function sanitizeFilename(filename) {
    return path.basename(filename)
        .normalize("NFKC")
        .replace(/[^a-zA-Z0-9._ -]/g, "_")
        .replace(/\s+/g, " ")
        .slice(0, 180);
}

class UploadSessionService {
    constructor(options = {}) {
        this.root = path.resolve(
            options.root ||
            process.env.CONTENT_ENGINE_UPLOAD_DIR ||
            "./storage/uploads"
        );
        this.maxUploadBytes = Number(
            options.maxUploadBytes ||
            process.env.CONTENT_ENGINE_MAX_UPLOAD_BYTES ||
            50 * 1024 * 1024 * 1024
        );
        this.maxChunkBytes = Number(
            options.maxChunkBytes ||
            process.env.CONTENT_ENGINE_CHUNK_BYTES ||
            8 * 1024 * 1024
        );
        this.probe = options.probe || probeVideo;
        this.checksum = options.checksum || sha256File;
        this.repository = options.repository || new VideoRepository();
    }

    sessionDirectory(uploadId) {
        if (!/^[0-9a-f-]{36}$/i.test(uploadId)) {
            throw Object.assign(new Error("Identificador de subida inválido."), {
                statusCode: 400,
                code: "INVALID_UPLOAD_ID"
            });
        }

        return path.join(this.root, uploadId);
    }

    manifestPath(uploadId) {
        return path.join(this.sessionDirectory(uploadId), "manifest.json");
    }

    partPath(uploadId) {
        return path.join(this.sessionDirectory(uploadId), "video.part");
    }

    async writeManifest(manifest) {
        const manifestPath = this.manifestPath(manifest.uploadId);
        const temporaryPath = `${manifestPath}.${process.pid}.tmp`;
        await fs.writeFile(temporaryPath, JSON.stringify(manifest, null, 2));
        await fs.rename(temporaryPath, manifestPath);
        await this.repository.upsert(manifest);
        return manifest;
    }

    async get(uploadId) {
        try {
            return JSON.parse(await fs.readFile(this.manifestPath(uploadId), "utf8"));
        } catch (error) {
            if (error.code === "ENOENT") {
                throw Object.assign(new Error("Subida no encontrada."), {
                    statusCode: 404,
                    code: "UPLOAD_NOT_FOUND"
                });
            }
            throw error;
        }
    }

    async create(input) {
        const data = createUploadSchema.parse(input);
        const filename = sanitizeFilename(data.filename);
        const extension = path.extname(filename).toLowerCase();

        if (!allowedExtensions.has(extension) || !allowedMimeTypes.has(data.mimeType)) {
            throw Object.assign(new Error("Formato de video no permitido."), {
                statusCode: 415,
                code: "UNSUPPORTED_VIDEO_FORMAT"
            });
        }

        if (data.totalBytes > this.maxUploadBytes) {
            throw Object.assign(new Error("El video supera el límite configurado."), {
                statusCode: 413,
                code: "VIDEO_TOO_LARGE"
            });
        }

        const uploadId = crypto.randomUUID();
        await fs.mkdir(this.sessionDirectory(uploadId), { recursive: true });
        const handle = await fs.open(this.partPath(uploadId), "w");
        await handle.close();

        const manifest = {
            uploadId,
            originalFilename: filename,
            mimeType: data.mimeType,
            totalBytes: data.totalBytes,
            receivedBytes: 0,
            ranges: [],
            progress: 0,
            status: "UPLOADING",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        return this.writeManifest(manifest);
    }

    async writeChunk(uploadId, contentRange, chunk) {
        const manifest = await this.get(uploadId);
        const range = parseContentRange(contentRange);

        if (manifest.status !== "UPLOADING") {
            throw Object.assign(new Error("La subida ya no acepta fragmentos."), {
                statusCode: 409,
                code: "UPLOAD_NOT_WRITABLE"
            });
        }

        if (range.total !== manifest.totalBytes || chunk.length !== range.length) {
            throw Object.assign(new Error("El tamaño del fragmento no coincide con Content-Range."), {
                statusCode: 400,
                code: "CHUNK_SIZE_MISMATCH"
            });
        }

        if (chunk.length > this.maxChunkBytes) {
            throw Object.assign(new Error("El fragmento supera el límite configurado."), {
                statusCode: 413,
                code: "CHUNK_TOO_LARGE"
            });
        }

        const handle = await fs.open(this.partPath(uploadId), "r+");
        try {
            await handle.write(chunk, 0, chunk.length, range.start);
            await handle.sync();
        } finally {
            await handle.close();
        }

        manifest.ranges = mergeRanges([
            ...manifest.ranges,
            { start: range.start, end: range.end }
        ]);
        manifest.receivedBytes = coveredBytes(manifest.ranges);
        manifest.progress = Math.floor(
            (manifest.receivedBytes / manifest.totalBytes) * 100
        );
        manifest.updatedAt = new Date().toISOString();

        return this.writeManifest(manifest);
    }

    async complete(uploadId) {
        const manifest = await this.get(uploadId);

        if (!isComplete(manifest.ranges, manifest.totalBytes)) {
            throw Object.assign(new Error("Aún faltan fragmentos del video."), {
                statusCode: 409,
                code: "UPLOAD_INCOMPLETE"
            });
        }

        manifest.status = "VALIDATING";
        manifest.updatedAt = new Date().toISOString();
        await this.writeManifest(manifest);

        const extension = path.extname(manifest.originalFilename).toLowerCase();
        const finalPath = path.join(this.sessionDirectory(uploadId), `original${extension}`);

        try {
            await fs.rename(this.partPath(uploadId), finalPath);
            const [media, checksumSha256] = await Promise.all([
                this.probe(finalPath),
                this.checksum(finalPath)
            ]);

            manifest.status = "QUEUED";
            manifest.progress = 100;
            manifest.filePath = finalPath;
            manifest.media = media;
            manifest.checksumSha256 = checksumSha256;
            manifest.completedAt = new Date().toISOString();
            manifest.updatedAt = manifest.completedAt;
            return this.writeManifest(manifest);
        } catch (error) {
            manifest.status = "FAILED";
            manifest.errorCode = error.code || "VIDEO_VALIDATION_FAILED";
            manifest.errorMessage = error.message;
            manifest.updatedAt = new Date().toISOString();
            await this.writeManifest(manifest);
            throw error;
        }
    }
}

module.exports = {
    UploadSessionService,
    sanitizeFilename,
    createUploadSchema
};
