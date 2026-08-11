const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const {
    LocalVideoProcessor,
    deterministicClipId
} = require("../../src/contentEngine/video/localVideoProcessor");

const execFileAsync = promisify(execFile);

test("el agente local procesa un video real sin devolver rutas absolutas", { timeout: 60_000 }, async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pixellabs-local-video-"));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const inbox = path.join(directory, "inbox");
    const work = path.join(directory, "work");
    await fs.mkdir(inbox);
    const source = path.join(inbox, "source.mp4");
    await execFileAsync("ffmpeg", [
        "-y",
        "-f", "lavfi", "-i", "color=c=green:s=320x180:d=3",
        "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
        "-map", "0:v", "-map", "1:a", "-t", "3",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", source
    ]);
    const sourceStat = await fs.stat(source);
    const clipId = "11111111-1111-4111-8111-111111111111";
    const fakeAnalyzer = {
        analyze: async segmentPaths => ({
            summary: { segments: segmentPaths.length, candidateClips: 1 },
            segments: [{
                index: 0,
                path: segmentPaths[0],
                startMs: 0,
                endMs: 2500,
                status: "COMPLETED",
                analysis: { privacyStatus: "PENDING_HUMAN_REVIEW" }
            }],
            moments: [{
                analysisKey: "fixture-moment",
                type: "STEADY_PROCESS",
                startMs: 0,
                endMs: 2000,
                score: 80,
                evidence: {},
                privacyStatus: "PENDING"
            }],
            clips: [{
                id: clipId,
                detectedMomentKey: "fixture-moment",
                startMs: 0,
                endMs: 2000,
                topic: "Proceso",
                hook: null,
                onScreenText: null,
                caption: null,
                recommendedPlatforms: ["instagram", "tiktok", "facebook"],
                score: 80,
                status: "DETECTED",
                fingerprint: "fixture-fingerprint",
                privacyStatus: "PENDING_HUMAN_REVIEW",
                metadata: { automaticPublishEligible: false }
            }]
        })
    };
    const progress = [];
    const processor = new LocalVideoProcessor({ inboxRoot: inbox, workRoot: work, analyzer: fakeAnalyzer });
    const result = await processor.process({
        id: "22222222-2222-4222-8222-222222222222",
        attempt: 1,
        payload: {
            source: {
                relativePath: "source.mp4",
                filename: "source.mp4",
                byteSize: sourceStat.size,
                mimeType: "video/mp4"
            }
        }
    }, { onProgress: async value => progress.push(value.stage) });

    assert.equal(result.analysis.clips.length, 1);
    assert.equal(result.artifacts.length, 2);
    assert.equal(result.analysis.clips[0].status, "DRAFT");
    assert.equal(
        result.analysis.clips[0].id,
        deterministicClipId(result.source.checksumSha256, "fixture-fingerprint")
    );
    assert.equal(result.artifacts.every(artifact => (
        artifact.clipId === result.analysis.clips[0].id
    )), true);
    assert.equal(result.analysis.clips[0].metadata.automaticPublishEligible, false);
    assert.equal(JSON.stringify(result.analysis).includes(directory), false);
    assert.ok(progress.includes("CREATING_PROXY"));
    assert.ok(progress.includes("RENDERING_CLIPS"));
    for (const artifact of result.artifacts) {
        await fs.access(artifact.localPath);
        assert.match(artifact.checksumSha256, /^[0-9a-f]{64}$/);
    }
});
