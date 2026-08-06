const test = require("node:test");
const assert = require("node:assert/strict");
const {
    parseSceneLog,
    parseSilenceLog,
    parseBlackLog,
    proposeMoments
} = require("../../src/contentEngine/video/videoSignalAnalyzer");

test("extrae cambios de escena, silencios y cuadros negros de ffmpeg", () => {
    assert.deepEqual(parseSceneLog("n:1 pts:10 pts_time:1.25\nn:2 pts_time:3.5"), [
        { timeMs: 1250, score: 0.75 },
        { timeMs: 3500, score: 0.75 }
    ]);
    assert.deepEqual(parseSilenceLog("silence_start: 2.0\nsilence_end: 4.5"), [
        { startMs: 2000, endMs: 4500 }
    ]);
    assert.deepEqual(parseBlackLog("black_start:1.5 black_end:2.75 black_duration:1.25"), [
        { startMs: 1500, endMs: 2750 }
    ]);
});

test("propone clips sin duplicados y siempre pendientes de privacidad", () => {
    const moments = proposeMoments([{
        index: 0,
        startMs: 0,
        endMs: 30000,
        analysis: {
            scenes: [{ timeMs: 5000 }, { timeMs: 5500 }],
            silenceIntervals: [],
            blackIntervals: []
        }
    }]);
    assert.equal(moments.length, 1);
    assert.equal(moments[0].privacyRisk, true);
    assert.equal(moments[0].privacyStatus, "PENDING");
});
