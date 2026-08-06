const test = require("node:test");
const assert = require("node:assert/strict");
const { cloneDefaultSettings } = require("../../src/contentEngine/config/defaults");
const {
    decideContent,
    assertCanPublish
} = require("../../src/contentEngine/review/contentDecisionService");

function safeCandidate(changes = {}) {
    return {
        scores: {
            visual: 98,
            spelling: 100,
            commercial: 97,
            brand: 97,
            originality: 98,
            privacy: 100,
            technical: 100,
            businessPotential: 92
        },
        productAvailable: true,
        commercialDataConfirmed: true,
        privacyRisk: false,
        copyrightRisk: 5,
        trademarkRisk: 5,
        hasThirdPartyWatermark: false,
        isDuplicate: false,
        templateApproved: true,
        newTrend: false,
        ownedOrLicensedMedia: true,
        ...changes
    };
}

function automaticSettings() {
    const settings = cloneDefaultSettings();
    settings.approvalMode = "partial";
    settings.autoPublish = true;
    settings.platformAutomation.facebook = true;
    return settings;
}

test("bloquea contenido de un producto agotado aunque su puntuación sea alta", () => {
    const decision = decideContent(
        safeCandidate({ productAvailable: false }),
        automaticSettings()
    );

    assert.equal(decision.decision, "NEEDS_CORRECTION");
    assert.ok(decision.reasons.includes("PRODUCT_UNAVAILABLE"));
});

test("una tendencia nueva siempre requiere aprobación humana inicialmente", () => {
    const decision = decideContent(
        safeCandidate({ newTrend: true }),
        automaticSettings()
    );

    assert.equal(decision.decision, "REQUIRES_HUMAN_APPROVAL");
    assert.equal(decision.eligibleForAutomaticPublishing, false);
});

test("solo una plantilla segura puede aprobarse automáticamente", () => {
    const settings = automaticSettings();
    const decision = decideContent(safeCandidate(), settings);

    assert.equal(decision.decision, "APPROVED_AUTOMATICALLY");
    assert.equal(
        assertCanPublish({
            decision,
            settings,
            platform: "facebook",
            productAvailable: true
        }),
        true
    );
});

test("el interruptor global bloquea incluso contenido ya aprobado", () => {
    const settings = automaticSettings();
    const decision = decideContent(safeCandidate(), settings);
    settings.enabled = false;

    assert.throws(
        () => assertCanPublish({
            decision,
            settings,
            platform: "facebook",
            productAvailable: true
        }),
        error => error.code === "PUBLICATION_BLOCKED" &&
            error.reasons.includes("ENGINE_STOPPED")
    );
});
