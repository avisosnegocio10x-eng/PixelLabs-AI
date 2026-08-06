const crypto = require("crypto");
const { spawn } = require("child_process");
const { probeVideo } = require("./mediaProbe");

function runCapture(args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
        let output = "";
        const append = chunk => {
            output = `${output}${chunk}`.slice(-(options.maxBuffer || 2_000_000));
        };
        child.stdout.on("data", append);
        child.stderr.on("data", append);
        child.once("error", reject);
        child.once("close", code => {
            if (code === 0) return resolve(output);
            reject(Object.assign(new Error(`Análisis ffmpeg terminó con código ${code}.`), {
                code: "FFMPEG_ANALYSIS_FAILED"
            }));
        });
    });
}

function parseSceneLog(log) {
    const scenes = [];
    for (const line of String(log || "").split("\n")) {
        const time = /pts_time:([0-9.]+)/.exec(line)?.[1];
        if (time === undefined) continue;
        scenes.push({ timeMs: Math.round(Number(time) * 1000), score: 0.75 });
    }
    return scenes.filter((scene, index) => (
        index === 0 || scene.timeMs !== scenes[index - 1].timeMs
    ));
}

function parseSilenceLog(log) {
    const intervals = [];
    let start = null;
    for (const line of String(log || "").split("\n")) {
        const startMatch = /silence_start: ([0-9.]+)/.exec(line);
        if (startMatch) start = Math.round(Number(startMatch[1]) * 1000);
        const endMatch = /silence_end: ([0-9.]+)/.exec(line);
        if (endMatch) {
            intervals.push({ startMs: start ?? 0, endMs: Math.round(Number(endMatch[1]) * 1000) });
            start = null;
        }
    }
    return intervals;
}

function parseBlackLog(log) {
    const intervals = [];
    const pattern = /black_start:([0-9.]+) black_end:([0-9.]+)/g;
    for (const match of String(log || "").matchAll(pattern)) {
        intervals.push({
            startMs: Math.round(Number(match[1]) * 1000),
            endMs: Math.round(Number(match[2]) * 1000)
        });
    }
    return intervals;
}

function overlapRatio(window, interval) {
    const overlap = Math.max(0, Math.min(window.endMs, interval.endMs) - Math.max(window.startMs, interval.startMs));
    return overlap / Math.max(1, window.endMs - window.startMs);
}

function deduplicateMoments(moments) {
    const selected = [];
    for (const moment of [...moments].sort((a, b) => b.score - a.score)) {
        const duplicate = selected.some(existing => {
            const overlap = Math.max(0, Math.min(moment.endMs, existing.endMs) - Math.max(moment.startMs, existing.startMs));
            const shortest = Math.min(moment.endMs - moment.startMs, existing.endMs - existing.startMs);
            return overlap / Math.max(1, shortest) > 0.72;
        });
        if (!duplicate) selected.push(moment);
    }
    return selected.sort((a, b) => a.startMs - b.startMs);
}

function fingerprint(value) {
    return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function proposeMoments(segments) {
    const proposals = [];
    for (const segment of segments) {
        const start = segment.startMs;
        const duration = segment.endMs - segment.startMs;
        for (const scene of segment.analysis.scenes) {
            const window = {
                startMs: Math.max(start, start + scene.timeMs - 2500),
                endMs: Math.min(segment.endMs, start + scene.timeMs + 12500)
            };
            if (window.endMs - window.startMs < 5000) continue;
            const localWindow = {
                startMs: window.startMs - start,
                endMs: window.endMs - start
            };
            const black = segment.analysis.blackIntervals.some(interval => overlapRatio(localWindow, interval) > 0.4);
            const silent = segment.analysis.silenceIntervals.some(interval => overlapRatio(localWindow, interval) > 0.65);
            proposals.push({
                type: "SCENE_CHANGE",
                ...window,
                score: Math.max(0, Math.min(100, Math.round(78 - (black ? 45 : 0) - (silent ? 12 : 0)))),
                evidence: { sceneChange: true, black, mostlySilent: silent },
                privacyRisk: true,
                privacyStatus: "PENDING"
            });
        }

        if (segment.analysis.scenes.length === 0 && duration >= 8000) {
            const localWindow = {
                startMs: Math.round(duration * 0.15),
                endMs: Math.min(duration, Math.round(duration * 0.15) + 15000)
            };
            const black = segment.analysis.blackIntervals.some(interval => overlapRatio(localWindow, interval) > 0.4);
            if (!black) {
                proposals.push({
                    type: "STEADY_PROCESS",
                    startMs: start + localWindow.startMs,
                    endMs: start + localWindow.endMs,
                    score: 58,
                    evidence: { sceneChange: false, requiresSemanticReview: true },
                    privacyRisk: true,
                    privacyStatus: "PENDING"
                });
            }
        }
    }
    return deduplicateMoments(proposals).map((moment, index) => ({
        ...moment,
        analysisKey: fingerprint(`${moment.type}:${moment.startMs}:${moment.endMs}:${index}`)
    }));
}

class VideoSignalAnalyzer {
    constructor(options = {}) {
        this.runner = options.runner || runCapture;
        this.probe = options.probe || probeVideo;
    }

    async analyzeSegment(filePath, segmentIndex, startMs) {
        const media = await this.probe(filePath);
        const [sceneLog, silenceLog, blackLog] = await Promise.all([
            this.runner([
                "-hide_banner", "-i", filePath,
                "-vf", "select=gt(scene\\,0.32),showinfo",
                "-an", "-f", "null", "-"
            ]),
            this.runner([
                "-hide_banner", "-i", filePath,
                "-af", "silencedetect=noise=-35dB:d=1.2",
                "-vn", "-f", "null", "-"
            ]),
            this.runner([
                "-hide_banner", "-i", filePath,
                "-vf", "blackdetect=d=1.0:pix_th=0.10",
                "-an", "-f", "null", "-"
            ])
        ]);
        return {
            index: segmentIndex,
            path: filePath,
            startMs,
            endMs: startMs + media.durationMs,
            durationMs: media.durationMs,
            status: "COMPLETED",
            analysis: {
                scenes: parseSceneLog(sceneLog),
                silenceIntervals: parseSilenceLog(silenceLog),
                blackIntervals: parseBlackLog(blackLog),
                semanticStatus: "PENDING_PROVIDER",
                transcriptionStatus: "PENDING_PROVIDER",
                privacyStatus: "PENDING_HUMAN_REVIEW"
            }
        };
    }

    async analyze(segmentPaths) {
        const segments = [];
        let offsetMs = 0;
        for (let index = 0; index < segmentPaths.length; index += 1) {
            const segment = await this.analyzeSegment(segmentPaths[index], index, offsetMs);
            segments.push(segment);
            offsetMs = segment.endMs;
        }
        const moments = proposeMoments(segments);
        const clips = moments.map(moment => ({
            id: crypto.randomUUID(),
            detectedMomentKey: moment.analysisKey,
            startMs: moment.startMs,
            endMs: moment.endMs,
            durationMs: moment.endMs - moment.startMs,
            topic: moment.type === "SCENE_CHANGE" ? "Cambio visual detectado" : "Proceso continuo",
            hook: null,
            onScreenText: null,
            caption: null,
            recommendedPlatforms: ["instagram", "tiktok", "facebook"],
            score: moment.score,
            status: "DETECTED",
            fingerprint: fingerprint(`${moment.startMs}:${moment.endMs}`),
            privacyStatus: "PENDING_HUMAN_REVIEW",
            metadata: { automaticPublishEligible: false, semanticReviewRequired: true }
        }));
        return {
            segments,
            moments,
            clips,
            summary: {
                segments: segments.length,
                detectedMoments: moments.length,
                candidateClips: clips.length,
                privacyCleared: 0,
                automaticallyPublishable: 0
            }
        };
    }
}

module.exports = {
    VideoSignalAnalyzer,
    runCapture,
    parseSceneLog,
    parseSilenceLog,
    parseBlackLog,
    proposeMoments,
    deduplicateMoments,
    fingerprint
};
