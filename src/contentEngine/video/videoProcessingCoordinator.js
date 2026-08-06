const fs = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");

function runFfmpeg(args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn("ffmpeg", args, {
            stdio: ["ignore", "ignore", "pipe"]
        });
        let stderr = "";

        if (options.onChild) options.onChild(child);
        child.stderr.on("data", chunk => {
            stderr = `${stderr}${chunk}`.slice(-8_000);
        });
        child.once("error", reject);
        child.once("close", code => {
            if (code === 0) return resolve();
            reject(Object.assign(new Error(`ffmpeg terminó con código ${code}: ${stderr}`), {
                code: "FFMPEG_FAILED"
            }));
        });
    });
}

class VideoProcessingCoordinator {
    constructor(uploadService, options = {}) {
        this.uploadService = uploadService;
        this.maxConcurrent = Number(
            options.maxConcurrent ||
            process.env.CONTENT_ENGINE_MAX_CONCURRENT_VIDEO_JOBS ||
            1
        );
        this.pending = [];
        this.running = new Map();
    }

    async enqueue(uploadId) {
        if (!this.pending.includes(uploadId) && !this.running.has(uploadId)) {
            this.pending.push(uploadId);
        }
        this.drain();
    }

    async recover() {
        try {
            const entries = await fs.readdir(this.uploadService.root, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isDirectory()) continue;
                try {
                    const manifest = await this.uploadService.get(entry.name);
                    if (["QUEUED", "PROCESSING"].includes(manifest.status)) {
                        manifest.status = "QUEUED";
                        await this.uploadService.writeManifest(manifest);
                        await this.enqueue(entry.name);
                    }
                } catch (error) {
                    console.error("No se pudo recuperar una subida", error.message);
                }
            }
        } catch (error) {
            if (error.code !== "ENOENT") throw error;
        }
    }

    drain() {
        while (this.running.size < this.maxConcurrent && this.pending.length > 0) {
            const uploadId = this.pending.shift();
            this.process(uploadId).catch(error => {
                console.error("Error procesando video", { uploadId, message: error.message });
            });
        }
    }

    async process(uploadId) {
        const state = { child: null, paused: false };
        this.running.set(uploadId, state);
        let manifest = await this.uploadService.get(uploadId);
        const directory = this.uploadService.sessionDirectory(uploadId);
        const proxyPath = path.join(directory, "proxy.mp4");
        const segmentDirectory = path.join(directory, "segments");

        try {
            manifest.status = "PROCESSING";
            manifest.processingStage = "PROXY";
            manifest.progress = 1;
            await this.uploadService.writeManifest(manifest);

            await runFfmpeg([
                "-y", "-i", manifest.filePath,
                "-vf", "scale='min(854,iw)':-2",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "30",
                "-c:a", "aac", "-b:a", "64k",
                "-movflags", "+faststart",
                proxyPath
            ], { onChild: child => { state.child = child; } });

            manifest = await this.uploadService.get(uploadId);
            manifest.processingStage = "SEGMENTING";
            manifest.progress = 55;
            manifest.proxyPath = proxyPath;
            await this.uploadService.writeManifest(manifest);

            await fs.mkdir(segmentDirectory, { recursive: true });
            await runFfmpeg([
                "-y", "-i", proxyPath,
                "-map", "0", "-c", "copy",
                "-f", "segment", "-segment_time", "300",
                "-reset_timestamps", "1",
                path.join(segmentDirectory, "segment-%05d.mp4")
            ], { onChild: child => { state.child = child; } });

            const segments = (await fs.readdir(segmentDirectory))
                .filter(file => file.endsWith(".mp4"))
                .sort()
                .map(file => path.join(segmentDirectory, file));

            manifest = await this.uploadService.get(uploadId);
            manifest.status = "COMPLETED";
            manifest.processingStage = "READY_FOR_ANALYSIS";
            manifest.progress = 100;
            manifest.proxyPath = proxyPath;
            manifest.segmentPaths = segments;
            manifest.processedAt = new Date().toISOString();
            await this.uploadService.writeManifest(manifest);
        } catch (error) {
            manifest = await this.uploadService.get(uploadId);
            if (manifest.status !== "PAUSED") {
                manifest.status = "FAILED";
                manifest.errorCode = error.code || "VIDEO_PROCESSING_FAILED";
                manifest.errorMessage = error.message;
                await this.uploadService.writeManifest(manifest);
            }
            throw error;
        } finally {
            this.running.delete(uploadId);
            this.drain();
        }
    }

    async pause(uploadId) {
        const state = this.running.get(uploadId);
        const manifest = await this.uploadService.get(uploadId);

        if (!state?.child) {
            this.pending = this.pending.filter(id => id !== uploadId);
        } else {
            state.child.kill("SIGSTOP");
            state.paused = true;
        }

        manifest.status = "PAUSED";
        manifest.updatedAt = new Date().toISOString();
        return this.uploadService.writeManifest(manifest);
    }

    async resume(uploadId) {
        const state = this.running.get(uploadId);
        const manifest = await this.uploadService.get(uploadId);

        if (manifest.status !== "PAUSED") {
            throw Object.assign(new Error("El video no está pausado."), {
                statusCode: 409,
                code: "VIDEO_NOT_PAUSED"
            });
        }

        manifest.status = "PROCESSING";
        manifest.updatedAt = new Date().toISOString();
        await this.uploadService.writeManifest(manifest);

        if (state?.child && state.paused) {
            state.child.kill("SIGCONT");
            state.paused = false;
        } else {
            await this.enqueue(uploadId);
        }

        return manifest;
    }
}

module.exports = {
    VideoProcessingCoordinator,
    runFfmpeg
};
