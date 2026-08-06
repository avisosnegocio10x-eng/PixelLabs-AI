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

async function fixture(t) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pixellabs-lifecycle-"));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    return new ContentLifecycleService({
        repository: new FileContentRepository(path.join(directory, "content.json")),
        catalog: new FileCatalogRepository(path.join(directory, "catalog.json")),
        settings: new ContentSettingsService(
            new FileSettingsRepository(path.join(directory, "settings.json"))
        )
    });
}

const highScores = {
    visual: 98,
    spelling: 100,
    commercial: 98,
    brand: 97,
    originality: 96,
    privacy: 100,
    technical: 99,
    businessPotential: 94
};

test("un borrador revisado sigue esperando aprobación humana", async t => {
    const service = await fixture(t);
    const draft = await service.createDraft({
        productReference: "LLV-024",
        objective: "Generar mensajes calificados",
        format: "reel",
        title: "Tu nombre, convertido en llavero",
        platforms: ["instagram"]
    });
    const result = await service.review(draft.id, {
        scores: highScores,
        privacyRisk: false,
        copyrightRisk: 0,
        trademarkRisk: 0,
        hasThirdPartyWatermark: false,
        isDuplicate: false,
        templateApproved: true,
        newTrend: false,
        ownedOrLicensedMedia: true
    });
    assert.equal(result.decision.decision, "REQUIRES_HUMAN_APPROVAL");
    assert.equal(result.item.status, "REQUIRES_HUMAN_APPROVAL");
    assert.equal(result.decision.eligibleForAutomaticPublishing, false);

    const approved = await service.approve(draft.id);
    assert.equal(approved.status, "APPROVED");
    assert.equal(approved.metadata.autoPublish, false);
});

test("no permite aprobar un borrador que no pasó las ocho revisiones", async t => {
    const service = await fixture(t);
    const draft = await service.createDraft({
        productReference: "LLV-024",
        objective: "Mostrar un producto",
        format: "image",
        platforms: ["facebook"]
    });
    await assert.rejects(() => service.approve(draft.id), error => (
        error.code === "CONTENT_NOT_READY_FOR_APPROVAL"
    ));
});

test("rechaza contenido duplicado por fingerprint", async t => {
    const service = await fixture(t);
    const input = {
        productReference: "LLV-024",
        objective: "Mostrar un producto",
        format: "image",
        title: "Llavero personalizado",
        platforms: ["facebook"]
    };
    await service.createDraft(input);
    await assert.rejects(() => service.createDraft(input), error => error.code === "DUPLICATE_CONTENT");
});
