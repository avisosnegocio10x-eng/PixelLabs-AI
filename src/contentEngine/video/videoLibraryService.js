const fs = require("fs/promises");
const path = require("path");
const { runFfmpeg } = require("./videoProcessingCoordinator");

const CLIP_STYLES = Object.freeze([
    "premium-minimalista",
    "dinamico",
    "educativo",
    "satisfactorio",
    "proceso-real",
    "tiktok",
    "instagram",
    "facebook"
]);

class VideoLibraryService {
    constructor(uploadService, options = {}) {
        this.uploadService = uploadService;
        this.outputWidth = options.outputWidth || 1080;
        this.outputHeight = options.outputHeight || 1920;
        this.ffmpeg = options.ffmpeg || runFfmpeg;
    }

    async listVideos() {
        try {
            const entries = await fs.readdir(this.uploadService.root, { withFileTypes: true });
            const videos = [];
            for (const entry of entries) {
                if (!entry.isDirectory()) continue;
                try {
                    const manifest = await this.uploadService.get(entry.name);
                    videos.push({
                        uploadId: manifest.uploadId,
                        originalFilename: manifest.originalFilename,
                        mimeType: manifest.mimeType,
                        totalBytes: manifest.totalBytes,
                        durationMs: manifest.media?.durationMs || null,
                        status: manifest.status,
                        processingStage: manifest.processingStage || null,
                        progress: manifest.progress,
                        clipsFound: manifest.analysis?.clips?.length || 0,
                        clipsApproved: manifest.analysis?.clips?.filter(clip => clip.status === "APPROVED").length || 0,
                        errorCode: manifest.errorCode || null,
                        createdAt: manifest.createdAt,
                        updatedAt: manifest.updatedAt
                    });
                } catch (error) {
                    if (error.code !== "UPLOAD_NOT_FOUND") throw error;
                }
            }
            return videos.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
        } catch (error) {
            if (error.code === "ENOENT") return [];
            throw error;
        }
    }

    async listClips(filters = {}) {
        const videos = await this.listVideos();
        const clips = [];
        for (const video of videos) {
            const manifest = await this.uploadService.get(video.uploadId);
            for (const clip of manifest.analysis?.clips || []) {
                if (filters.status && clip.status !== filters.status) continue;
                if (filters.platform && !clip.recommendedPlatforms.includes(filters.platform)) continue;
                clips.push({ ...clip, uploadId: video.uploadId, originalFilename: video.originalFilename });
            }
        }
        return clips;
    }

    async requireClip(uploadId, clipId) {
        const manifest = await this.uploadService.get(uploadId);
        const clip = manifest.analysis?.clips?.find(candidate => candidate.id === clipId);
        if (!clip) {
            throw Object.assign(new Error("Clip no encontrado."), {
                statusCode: 404,
                code: "CLIP_NOT_FOUND"
            });
        }
        return { manifest, clip };
    }

    async saveManifest(manifest) {
        manifest.updatedAt = new Date().toISOString();
        await this.uploadService.writeManifest(manifest);
        await this.uploadService.repository.syncAnalysis?.(manifest);
        return manifest;
    }

    async render(uploadId, clipId, style) {
        if (!CLIP_STYLES.includes(style)) {
            throw Object.assign(new Error("Estilo de clip inválido."), {
                statusCode: 422,
                code: "INVALID_CLIP_STYLE"
            });
        }
        const { manifest, clip } = await this.requireClip(uploadId, clipId);
        if (!manifest.proxyPath) {
            throw Object.assign(new Error("El proxy del video no está listo."), {
                statusCode: 409,
                code: "VIDEO_PROXY_NOT_READY"
            });
        }
        if (["APPROVED", "REJECTED", "ARCHIVED", "PUBLISHED"].includes(clip.status)) {
            throw Object.assign(new Error("El clip no puede renderizarse en su estado actual."), {
                statusCode: 409,
                code: "CLIP_NOT_RENDERABLE"
            });
        }

        clip.status = "PROCESSING";
        await this.saveManifest(manifest);
        const directory = path.join(this.uploadService.sessionDirectory(uploadId), "renders", clip.id);
        await fs.mkdir(directory, { recursive: true });
        const version = (clip.versions?.length || 0) + 1;
        const videoPath = path.join(directory, `v${version}-${style}.mp4`);
        const coverPath = path.join(directory, `v${version}-${style}.jpg`);
        const durationSeconds = (clip.endMs - clip.startMs) / 1000;
        const startSeconds = clip.startMs / 1000;
        const filter = [
            `[0:v]scale=${this.outputWidth}:${this.outputHeight}:force_original_aspect_ratio=increase,`,
            `crop=${this.outputWidth}:${this.outputHeight},gblur=sigma=24[bg];`,
            `[0:v]scale=${this.outputWidth}:${this.outputHeight}:force_original_aspect_ratio=decrease[fg];`,
            "[bg][fg]overlay=(W-w)/2:(H-h)/2,format=yuv420p[outv]"
        ].join("");

        try {
            await this.ffmpeg([
                "-y", "-ss", String(startSeconds), "-t", String(durationSeconds),
                "-i", manifest.proxyPath,
                "-filter_complex", filter,
                "-map", "[outv]", "-map", "0:a?",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
                "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
                videoPath
            ]);
            await this.ffmpeg([
                "-y", "-ss", "0.5", "-i", videoPath,
                "-frames:v", "1", "-q:v", "2", coverPath
            ]);
            clip.status = "DRAFT";
            clip.versions = [...(clip.versions || []), {
                version,
                style,
                platform: null,
                videoPath,
                coverPath,
                subtitlePath: null,
                status: "DRAFT",
                createdAt: new Date().toISOString(),
                renderSettings: {
                    width: this.outputWidth,
                    height: this.outputHeight,
                    automaticEffects: false,
                    textAdded: false,
                    logoAdded: false
                }
            }];
            await this.saveManifest(manifest);
            return clip;
        } catch (error) {
            clip.status = "FAILED";
            clip.metadata = { ...clip.metadata, renderErrorCode: error.code || "CLIP_RENDER_FAILED" };
            await this.saveManifest(manifest);
            throw error;
        }
    }

    async review(uploadId, clipId, input) {
        const { manifest, clip } = await this.requireClip(uploadId, clipId);
        if (input.decision === "APPROVE") {
            if (!input.privacyCleared) {
                throw Object.assign(new Error("La revisión de privacidad es obligatoria."), {
                    statusCode: 409,
                    code: "CLIP_PRIVACY_NOT_CLEARED"
                });
            }
            if (input.qualityScore < 85) {
                throw Object.assign(new Error("La calidad del clip es insuficiente."), {
                    statusCode: 409,
                    code: "CLIP_QUALITY_TOO_LOW"
                });
            }
            if (!(clip.versions || []).some(version => version.status === "DRAFT")) {
                throw Object.assign(new Error("Primero debe renderizarse una versión del clip."), {
                    statusCode: 409,
                    code: "CLIP_VERSION_REQUIRED"
                });
            }
            clip.status = "APPROVED";
            clip.privacyStatus = "CLEARED_BY_HUMAN";
            clip.humanApprovedAt = new Date().toISOString();
            clip.metadata = {
                ...clip.metadata,
                automaticPublishEligible: false,
                qualityScore: input.qualityScore,
                reviewNotes: input.notes || null
            };
        } else {
            clip.status = "REJECTED";
            clip.metadata = {
                ...clip.metadata,
                automaticPublishEligible: false,
                qualityScore: input.qualityScore,
                rejectionReason: input.notes || "Rechazado manualmente"
            };
        }
        await this.saveManifest(manifest);
        return clip;
    }
}

module.exports = {
    VideoLibraryService,
    CLIP_STYLES
};
