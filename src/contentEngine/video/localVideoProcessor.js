const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { runFfmpeg } = require("./videoProcessingCoordinator");
const { VideoSignalAnalyzer } = require("./videoSignalAnalyzer");
const { probeVideo } = require("./mediaProbe");
const { sha256File } = require("./checksum");
const { resolveLocalSource } = require("./localSourcePolicy");

function deterministicClipId(sourceChecksum, fingerprint) {
    const bytes = crypto.createHash("sha256")
        .update(`${sourceChecksum}:${fingerprint}`)
        .digest()
        .subarray(0, 16);
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString("hex");
    return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)]
        .join("-");
}

function stripLocalPaths(analysis, sourceChecksum = "") {
    return {
        summary: analysis.summary || {},
        segments: (analysis.segments || []).map(segment => ({
            index: segment.index,
            startMs: segment.startMs,
            endMs: segment.endMs,
            status: segment.status,
            analysis: segment.analysis || {}
        })),
        moments: (analysis.moments || []).map(moment => ({
            analysisKey: moment.analysisKey,
            type: moment.type,
            startMs: moment.startMs,
            endMs: moment.endMs,
            score: moment.score,
            evidence: moment.evidence || {},
            privacyStatus: "PENDING_HUMAN_REVIEW"
        })),
        clips: (analysis.clips || []).map(clip => ({
            id: sourceChecksum
                ? deterministicClipId(sourceChecksum, clip.fingerprint)
                : clip.id,
            detectedMomentKey: clip.detectedMomentKey || null,
            startMs: clip.startMs,
            endMs: clip.endMs,
            topic: clip.topic || null,
            hook: clip.hook || null,
            onScreenText: clip.onScreenText || null,
            caption: clip.caption || null,
            recommendedPlatforms: clip.recommendedPlatforms || [],
            score: clip.score ?? null,
            status: "DRAFT",
            fingerprint: clip.fingerprint,
            privacyStatus: "PENDING_HUMAN_REVIEW",
            metadata: {
                ...(clip.metadata || {}),
                automaticPublishEligible: false,
                localWorkerRendered: true
            }
        }))
    };
}

function contentTypeFor(filename) {
    const extension = path.extname(filename).toLowerCase();
    if (extension === ".mp4") return "video/mp4";
    if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
    if (extension === ".png") return "image/png";
    if (extension === ".webp") return "image/webp";
    if (extension === ".vtt") return "text/vtt";
    return "application/octet-stream";
}

async function describeArtifact(input) {
    const [stat, checksumSha256] = await Promise.all([
        fs.stat(input.localPath),
        sha256File(input.localPath)
    ]);
    return {
        ...input,
        filename: path.basename(input.localPath),
        contentType: contentTypeFor(input.localPath),
        byteSize: stat.size,
        checksumSha256
    };
}

class LocalVideoProcessor {
    constructor(options = {}) {
        this.inboxRoot = path.resolve(
            options.inboxRoot || process.env.LOCAL_WORKER_INBOX_DIR || "./local-worker/inbox"
        );
        this.workRoot = path.resolve(
            options.workRoot || process.env.LOCAL_WORKER_WORK_DIR || "./local-worker/work"
        );
        this.analyzer = options.analyzer || new VideoSignalAnalyzer();
        this.probe = options.probe || probeVideo;
        this.checksum = options.checksum || sha256File;
        this.ffmpeg = options.ffmpeg || runFfmpeg;
        this.style = options.style || process.env.LOCAL_WORKER_CLIP_STYLE || "process-real";
    }

    async report(callback, progress, stage) {
        if (callback) await callback({ progress, stage });
    }

    async renderClip(proxyPath, clip, directory) {
        await fs.mkdir(directory, { recursive: true });
        const videoPath = path.join(directory, `v1-${this.style}.mp4`);
        const coverPath = path.join(directory, `v1-${this.style}.jpg`);
        const durationSeconds = (clip.endMs - clip.startMs) / 1000;
        const startSeconds = clip.startMs / 1000;
        const filter = [
            "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,",
            "crop=1080:1920,gblur=sigma=24[bg];",
            "[0:v]scale=1080:1920:force_original_aspect_ratio=decrease[fg];",
            "[bg][fg]overlay=(W-w)/2:(H-h)/2,format=yuv420p[outv]"
        ].join("");
        await this.ffmpeg([
            "-y", "-ss", String(startSeconds), "-t", String(durationSeconds),
            "-i", proxyPath,
            "-filter_complex", filter,
            "-map", "[outv]", "-map", "0:a?",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "24",
            "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart",
            videoPath
        ]);
        await this.ffmpeg([
            "-y", "-ss", "0.5", "-i", videoPath,
            "-frames:v", "1", "-q:v", "2", coverPath
        ]);
        return [
            await describeArtifact({
                artifactType: "clip-video",
                localPath: videoPath,
                clipId: clip.id,
                version: 1,
                style: this.style
            }),
            await describeArtifact({
                artifactType: "cover",
                localPath: coverPath,
                clipId: clip.id,
                version: 1,
                style: this.style
            })
        ];
    }

    async process(job, options = {}) {
        const sourceInput = job.payload?.source;
        if (!sourceInput?.relativePath) {
            throw Object.assign(new Error("El trabajo no contiene una fuente local."), {
                code: "LOCAL_SOURCE_REQUIRED"
            });
        }
        await this.report(options.onProgress, 1, "VALIDATING_LOCAL_SOURCE");
        const source = await resolveLocalSource(this.inboxRoot, sourceInput.relativePath);
        if (Number(sourceInput.byteSize) !== source.stat.size) {
            throw Object.assign(new Error("El video cambió después de encolarse."), {
                code: "LOCAL_SOURCE_CHANGED"
            });
        }

        const attemptDirectory = path.join(
            this.workRoot,
            job.id,
            `attempt-${Math.max(1, job.attempt)}`
        );
        const segmentDirectory = path.join(attemptDirectory, "segments");
        const renderDirectory = path.join(attemptDirectory, "renders");
        const proxyPath = path.join(attemptDirectory, "proxy.mp4");
        await fs.mkdir(segmentDirectory, { recursive: true });

        await this.report(options.onProgress, 4, "PROBING_AND_CHECKSUM");
        const [media, checksumSha256] = await Promise.all([
            this.probe(source.path),
            this.checksum(source.path)
        ]);
        if (
            sourceInput.checksumSha256 &&
            sourceInput.checksumSha256.toLowerCase() !== checksumSha256.toLowerCase()
        ) {
            throw Object.assign(new Error("El checksum del video no coincide."), {
                code: "LOCAL_SOURCE_CHECKSUM_MISMATCH"
            });
        }

        await this.report(options.onProgress, 8, "CREATING_PROXY");
        await this.ffmpeg([
            "-y", "-i", source.path,
            "-map", "0:v:0", "-map", "0:a?",
            "-vf", "scale='min(854,iw)':-2",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "30",
            "-c:a", "aac", "-b:a", "64k",
            "-movflags", "+faststart",
            proxyPath
        ]);

        await this.report(options.onProgress, 48, "SEGMENTING");
        await this.ffmpeg([
            "-y", "-i", proxyPath,
            "-map", "0", "-c", "copy",
            "-f", "segment", "-segment_time", "300",
            "-reset_timestamps", "1",
            path.join(segmentDirectory, "segment-%05d.mp4")
        ]);
        const segmentPaths = (await fs.readdir(segmentDirectory))
            .filter(file => file.endsWith(".mp4"))
            .sort()
            .map(file => path.join(segmentDirectory, file));

        await this.report(options.onProgress, 58, "ANALYZING_SIGNALS");
        const analysis = await this.analyzer.analyze(segmentPaths);
        const artifacts = [];
        const clips = analysis.clips || [];
        for (let index = 0; index < clips.length; index += 1) {
            const progress = 68 + Math.floor((index / Math.max(1, clips.length)) * 24);
            await this.report(options.onProgress, progress, "RENDERING_CLIPS");
            artifacts.push(...await this.renderClip(
                proxyPath,
                clips[index],
                path.join(renderDirectory, clips[index].id)
            ));
        }

        await this.report(options.onProgress, 94, "READY_TO_UPLOAD_ARTIFACTS");
        const sanitizedAnalysis = stripLocalPaths(analysis, checksumSha256);
        const stableClipIds = new Map((analysis.clips || []).map((clip, index) => [
            clip.id,
            sanitizedAnalysis.clips[index].id
        ]));
        return {
            source: {
                filename: path.basename(source.path),
                byteSize: source.stat.size,
                mimeType: sourceInput.mimeType,
                checksumSha256,
                durationMs: media.durationMs
            },
            analysis: sanitizedAnalysis,
            artifacts: artifacts.map(artifact => ({
                ...artifact,
                clipId: stableClipIds.get(artifact.clipId) || artifact.clipId
            }))
        };
    }
}

module.exports = {
    LocalVideoProcessor,
    stripLocalPaths,
    deterministicClipId,
    describeArtifact,
    contentTypeFor
};
