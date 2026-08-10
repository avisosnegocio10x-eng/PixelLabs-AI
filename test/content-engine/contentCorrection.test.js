const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { FileContentRepository } = require("../../src/contentEngine/repositories/contentRepository");
const { FileCatalogRepository } = require("../../src/contentEngine/repositories/catalogRepository");
const { FileSettingsRepository } = require("../../src/contentEngine/repositories/settingsRepository");
const { ContentSettingsService } = require("../../src/contentEngine/services/contentSettingsService");
const { ContentLifecycleService } = require("../../src/contentEngine/services/contentLifecycleService");
const { ContentCorrectionService } = require("../../src/contentEngine/services/contentCorrectionService");

async function fixture(t) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pixellabs-correction-"));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const repository = new FileContentRepository(path.join(directory, "content.json"));
    const settings = new ContentSettingsService(
        new FileSettingsRepository(path.join(directory, "settings.json"))
    );
    const lifecycle = new ContentLifecycleService({
        repository,
        catalog: new FileCatalogRepository(path.join(directory, "catalog.json")),
        settings
    });
    return {
        repository,
        lifecycle,
        corrections: new ContentCorrectionService({ repository, settings })
    };
}

const passing = {
    visual: 90,
    spelling: 90,
    commercial: 90,
    brand: 90,
    originality: 90,
    privacy: 90,
    technical: 90,
    businessPotential: 90
};

test("corrige solo texto de bajo riesgo y vuelve a revisión", async t => {
    const { lifecycle, corrections } = await fixture(t);
    const draft = await lifecycle.createDraft({
        productReference: "LLV-024",
        objective: "Generar mensajes",
        format: "post",
        primaryText: "Tu   llavero  , listo para ti!",
        platforms: ["facebook"]
    });
    await lifecycle.review(draft.id, {
        scores: { ...passing, spelling: 30 },
        privacyRisk: false,
        copyrightRisk: 0,
        trademarkRisk: 0,
        hasThirdPartyWatermark: false,
        isDuplicate: false,
        templateApproved: false,
        newTrend: false,
        ownedOrLicensedMedia: true
    });
    const result = await corrections.correct(draft.id);
    assert.equal(result.status, "CORRECTED_REVIEW_REQUIRED");
    assert.equal(result.item.status, "UNDER_REVIEW");
    assert.equal(result.item.primaryText, "Tu llavero, listo para ti!");
    assert.equal(result.autoPublish, false);
});

test("riesgos de privacidad nunca se corrigen automáticamente", async t => {
    const { lifecycle, corrections } = await fixture(t);
    const draft = await lifecycle.createDraft({
        productReference: "LLV-024",
        objective: "Mostrar proceso",
        format: "reel",
        primaryText: "Proceso real",
        platforms: ["instagram"]
    });
    await lifecycle.review(draft.id, {
        scores: { ...passing, privacy: 20 },
        privacyRisk: true,
        copyrightRisk: 0,
        trademarkRisk: 0,
        hasThirdPartyWatermark: false,
        isDuplicate: false,
        templateApproved: false,
        newTrend: false,
        ownedOrLicensedMedia: true
    });
    const result = await corrections.correct(draft.id);
    assert.equal(result.status, "HUMAN_REQUIRED");
    assert.equal(result.corrected, false);
});
