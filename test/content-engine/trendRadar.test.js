const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { FileTrendRepository } = require("../../src/contentEngine/repositories/trendRepository");
const { TrendRadarService } = require("../../src/contentEngine/services/trendRadarService");

async function fixture(t) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pixellabs-trends-"));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    return new TrendRadarService({
        repository: new FileTrendRepository(path.join(directory, "trends.json")),
        settings: { getSettings: async () => ({ minimumTrendScore: 70 }) },
        now: () => new Date("2026-08-10T18:00:00.000Z")
    });
}

test("normaliza, puntúa y deduplica una tendencia autorizada", async t => {
    const service = await fixture(t);
    const observation = {
        name: "Llaveros personalizados para regreso a clases",
        summary: "Demanda local observada sin copiar publicaciones ajenas.",
        source: {
            name: "Observación manual PixelLabs",
            sourceType: "manual",
            collectionMethod: "manual"
        },
        signals: {
            relevanceScore: 90,
            salesPotential: 90,
            messagesPotential: 95,
            localInterest: 90,
            conversionEase: 85,
            productAvailability: 100,
            ownedMediaAvailability: 100,
            originalityPotential: 90,
            productionDifficulty: 20,
            expectedDuration: 20
        }
    };
    const first = (await service.ingest([observation]))[0];
    const second = (await service.ingest([observation]))[0];
    assert.equal(first.id, second.id);
    assert.equal(first.status, "CANDIDATE");
    assert.equal(first.requiresHumanApproval, true);
    assert.equal((await service.listCandidates()).length, 1);
});

test("rechaza tendencias con riesgo legal alto", async t => {
    const service = await fixture(t);
    const [trend] = await service.ingest([{
        name: "Copiar personaje protegido",
        source: { collectionMethod: "manual" },
        signals: { copyrightRisk: 95, trademarkRisk: 90 }
    }]);
    assert.equal(trend.status, "REJECTED");
    assert.equal(trend.score.recommendation, "reject");
    assert.deepEqual(await service.listCandidates(), []);
});
