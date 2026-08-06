const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { VideoSignalAnalyzer } = require("../../src/contentEngine/video/videoSignalAnalyzer");
const { VideoLibraryService } = require("../../src/contentEngine/video/videoLibraryService");

const execFileAsync = promisify(execFile);

test("ffmpeg analiza y renderiza verticalmente un clip real", { timeout: 60_000 }, async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pixellabs-video-pipeline-"));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const source = path.join(directory, "source.mp4");
    await execFileAsync("ffmpeg", [
        "-y",
        "-f", "lavfi", "-i", "color=c=red:s=320x180:d=2",
        "-f", "lavfi", "-i", "color=c=blue:s=320x180:d=2",
        "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
        "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0[v]",
        "-map", "[v]", "-map", "2:a", "-t", "4",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", source
    ]);

    const analyzer = new VideoSignalAnalyzer();
    const analysis = await analyzer.analyze([source]);
    assert.equal(analysis.segments.length, 1);
    assert.ok(analysis.moments.length >= 0);
    assert.equal(analysis.summary.automaticallyPublishable, 0);

    const clip = {
        id: "11111111-1111-4111-8111-111111111111",
        startMs: 0,
        endMs: 3000,
        status: "DETECTED",
        recommendedPlatforms: ["instagram"],
        metadata: {},
        versions: []
    };
    const manifest = {
        uploadId: "22222222-2222-4222-8222-222222222222",
        originalFilename: "source.mp4",
        proxyPath: source,
        analysis: { clips: [clip] },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    const uploadService = {
        root: directory,
        repository: { upsert: async () => null, syncAnalysis: async () => null },
        sessionDirectory: () => directory,
        get: async () => manifest,
        writeManifest: async next => next
    };
    const library = new VideoLibraryService(uploadService, { outputWidth: 360, outputHeight: 640 });
    const rendered = await library.render(manifest.uploadId, clip.id, "premium-minimalista");
    assert.equal(rendered.status, "DRAFT");
    assert.equal(rendered.versions.length, 1);
    await fs.access(rendered.versions[0].videoPath);
    await fs.access(rendered.versions[0].coverPath);
    await assert.rejects(() => library.review(manifest.uploadId, clip.id, {
        decision: "APPROVE",
        privacyCleared: false,
        qualityScore: 95
    }), error => error.code === "CLIP_PRIVACY_NOT_CLEARED");
    const approved = await library.review(manifest.uploadId, clip.id, {
        decision: "APPROVE",
        privacyCleared: true,
        qualityScore: 95,
        notes: "Fixture segura"
    });
    assert.equal(approved.status, "APPROVED");
    assert.equal(approved.metadata.automaticPublishEligible, false);
});
