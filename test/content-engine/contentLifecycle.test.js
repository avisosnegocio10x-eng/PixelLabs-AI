const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const crypto = require("node:crypto");
const { FileContentRepository } = require("../../src/contentEngine/repositories/contentRepository");
const { FileCatalogRepository } = require("../../src/contentEngine/repositories/catalogRepository");
const { FileSettingsRepository } = require("../../src/contentEngine/repositories/settingsRepository");
const { ContentSettingsService } = require("../../src/contentEngine/services/contentSettingsService");
const { ContentLifecycleService } = require("../../src/contentEngine/services/contentLifecycleService");
const { draftSchema, editSchema } = require("../../src/contentEngine/controllers/contentController");

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

async function draftWithPlatformCopies(t, { approved = false } = {}) {
    const service = await fixture(t);
    const copies = Object.fromEntries(["facebook", "instagram", "tiktok"].map(platform => [platform, {
        title: `Borrador ${platform}`, caption: `Texto distinto para ${platform}.`,
        callToAction: "Consultar opciones.", hashtags: ["PixelLabs"], strategy: "Abrir consultas."
    }]));
    const aiPreparation = {
        runId: "fixture-ai-history", fullReviewComplete: true, providerRequests: 6, reviewStaleAfterCorrection: false,
        platformResults: Object.fromEntries(Object.keys(copies).map(platform => [platform, {
            reviewAttempt: 2, scores: { spelling: 95, visual: 0, privacy: 0 },
            findings: { visual: ["Falta el medio real."] },
            correction: { status: "HUMAN_REQUIRED", corrected: false }, reviewStaleAfterCorrection: false
        }]))
    };
    let item = await service.createDraft({
        productReference: "LLV-024", objective: "Generar consultas de personalización", format: "image",
        title: copies.facebook.title, primaryText: copies.facebook.caption, callToAction: copies.facebook.callToAction,
        hashtags: ["PixelLabs"], platforms: Object.keys(copies),
        metadata: { platformCopies: copies, aiPreparation, mediaAssetIds: [crypto.randomUUID()],
            pendingHumanApproval: true, manuallyApproved: false, approvalFingerprint: null,
            manualEditorialBaseline: { title: "Versión manual anterior", score: 87 } }
    });
    if (approved) {
        await service.review(item.id, { scores: highScores, privacyRisk: false, copyrightRisk: 0, trademarkRisk: 0,
            hasThirdPartyWatermark: false, isDuplicate: false, templateApproved: true, newTrend: false,
            ownedOrLicensedMedia: true });
        item = await service.approve(item.id);
    }
    return { service, item, copies };
}

test("adjuntar sólo un medio conserva las tres copias y vuelve obsoleta la revisión del recurso anterior", async t => {
    const { service, item, copies } = await draftWithPlatformCopies(t);
    const before = structuredClone(item.metadata.aiPreparation);
    const mediaAssetIds = [crypto.randomUUID()];
    const changes = editSchema.parse({ mediaAssetIds });
    assert.deepEqual(Object.keys(changes), ["mediaAssetIds"]);
    assert.equal(Object.hasOwn(changes, "hashtags"), false);
    assert.deepEqual(draftSchema.parse({ productReference: "LLV-024", objective: "Mostrar un producto",
        format: "image", platforms: ["facebook"] }).hashtags, []);
    const edited = await service.edit(item.id, changes);
    assert.equal(edited.id, item.id);
    assert.deepEqual(item.hashtags, ["PixelLabs"]);
    assert.deepEqual(edited.hashtags, ["PixelLabs"]);
    assert.deepEqual(edited.metadata.platformCopies, copies);
    assert.equal(Object.keys(edited.metadata.platformCopies).length, 3);
    assert.deepEqual(edited.metadata.mediaAssetIds, mediaAssetIds);
    assert.equal(edited.metadata.aiPreparation.fullReviewComplete, false);
    assert.equal(edited.metadata.aiPreparation.reviewStaleAfterMediaChange, true);
    assert.equal(edited.metadata.aiPreparation.reviewStaleAfterCorrection, false);
    assert.equal(edited.metadata.aiPreparation.providerRequests, before.providerRequests);
    for (const platform of Object.keys(copies)) {
        const result = edited.metadata.aiPreparation.platformResults[platform];
        assert.equal(result.reviewStaleAfterMediaChange, true);
        assert.equal(result.reviewStaleAfterCorrection, false);
        assert.deepEqual(result.scores, before.platformResults[platform].scores);
        assert.deepEqual(result.findings, before.platformResults[platform].findings);
        assert.deepEqual(result.correction, before.platformResults[platform].correction);
    }
    assert.deepEqual(item.metadata.aiPreparation, before);
    assert.deepEqual(edited.metadata.manualEditorialBaseline, item.metadata.manualEditorialBaseline);
    assert.equal(edited.status, "DRAFT");
    assert.equal(edited.metadata.pendingHumanApproval, true);
});

test("editar texto o combinar texto y medio sigue invalidando las copias de cada plataforma", async t => {
    for (const withMedia of [false, true]) {
        const { service, item } = await draftWithPlatformCopies(t);
        const changes = { primaryText: "Texto nuevo que necesita revisión." };
        if (withMedia) changes.mediaAssetIds = [crypto.randomUUID()];
        const parsed = editSchema.parse(changes);
        assert.equal(Object.hasOwn(parsed, "hashtags"), false);
        assert.deepEqual(Object.keys(parsed).sort(), withMedia ? ["mediaAssetIds", "primaryText"] : ["primaryText"]);
        const edited = await service.edit(item.id, parsed);
        assert.equal(edited.primaryText, changes.primaryText);
        assert.deepEqual(edited.hashtags, ["PixelLabs"]);
        assert.deepEqual(edited.metadata.platformCopies, {});
        assert.equal(edited.status, "DRAFT");
        assert.equal(edited.humanApprovalRequired, true);
        assert.equal(edited.metadata.pendingHumanApproval, true);
        assert.equal(edited.metadata.manuallyApproved, false);
        assert.equal(edited.approvedAt, null);
        assert.equal(edited.overallScore, null);
        assert.equal(edited.reviewPasses, 0);
        assert.equal(edited.metadata.approvalFingerprint, null);
        assert.equal(edited.metadata.autoPublish, false);
        assert.equal(edited.metadata.aiPreparation.fullReviewComplete, false);
        assert.equal(edited.metadata.aiPreparation.reviewStaleAfterCorrection, true);
        for (const result of Object.values(edited.metadata.aiPreparation.platformResults)) {
            assert.equal(result.reviewStaleAfterCorrection, true);
            assert.equal(result.reviewStaleAfterMediaChange === true, withMedia);
        }
        if (withMedia) {
            assert.deepEqual(edited.metadata.mediaAssetIds, changes.mediaAssetIds);
            assert.equal(edited.metadata.aiPreparation.reviewStaleAfterMediaChange, true);
        } else {
            assert.deepEqual(edited.metadata.mediaAssetIds, item.metadata.mediaAssetIds);
            assert.notEqual(edited.metadata.aiPreparation.reviewStaleAfterMediaChange, true);
        }
    }
});

test("cambiar sólo el medio invalida una aprobación previa sin borrar las revisiones históricas", async t => {
    const { service, item, copies } = await draftWithPlatformCopies(t, { approved: true });
    assert.equal(item.status, "APPROVED");
    assert.equal(item.metadata.manuallyApproved, true);
    assert.ok(item.approvedAt);
    assert.ok(item.overallScore > 85);
    assert.equal(item.reviewPasses, 8);
    const history = await service.repository.getReviewHistory(item.id);
    const changes = editSchema.parse({ mediaAssetIds: [crypto.randomUUID()] });
    assert.deepEqual(Object.keys(changes), ["mediaAssetIds"]);
    assert.equal(Object.hasOwn(changes, "hashtags"), false);
    const edited = await service.edit(item.id, changes);
    assert.deepEqual(edited.hashtags, ["PixelLabs"]);
    assert.deepEqual(edited.metadata.platformCopies, copies);
    assert.equal(edited.status, "DRAFT");
    assert.equal(edited.humanApprovalRequired, true);
    assert.equal(edited.metadata.pendingHumanApproval, true);
    assert.equal(edited.metadata.manuallyApproved, false);
    assert.equal(edited.approvedAt, null);
    assert.equal(edited.overallScore, null);
    assert.equal(edited.reviewPasses, 0);
    assert.equal(edited.metadata.approvalFingerprint, null);
    assert.equal(edited.metadata.autoPublish, false);
    assert.equal(edited.metadata.aiPreparation.reviewStaleAfterCorrection, false);
    assert.ok(Object.values(edited.metadata.aiPreparation.platformResults).every(result => result.reviewStaleAfterCorrection === false));
    assert.deepEqual(await service.repository.getReviewHistory(item.id), history);
    await assert.rejects(() => service.approve(item.id), error => error.code === "CONTENT_NOT_READY_FOR_APPROVAL");
});
