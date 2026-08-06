const test = require("node:test");
const assert = require("node:assert/strict");
const {
    normalizePlatform,
    mapContact
} = require("../../src/contentEngine/repositories/crmRepository");
const { extractAttributionCode } = require("../../src/handlers/conversationHandler");

test("normaliza plataformas CRM permitidas", () => {
    assert.equal(normalizePlatform("Instagram"), "instagram");
    assert.throws(() => normalizePlatform("telegram"), /Plataforma CRM inválida/);
});

test("mapea contactos sin exponer campos internos", () => {
    assert.deepEqual(mapContact({
        id: "database-id",
        external_id: "customer-id",
        platform: "messenger",
        display_name: "Cliente",
        ai_enabled: true,
        email_sent: false,
        status: "ACTIVE",
        metadata: {}
    }), {
        id: "customer-id",
        databaseId: "database-id",
        nombre: "Cliente",
        plataforma: "messenger",
        iaActiva: true,
        correoEnviado: false,
        estado: "ACTIVE",
        ultimaActividad: null,
        attributionCode: null,
        metadata: {}
    });
});

test("extrae un código de atribución sin confundir texto normal", () => {
    assert.equal(extractAttributionCode("Vi el reel PL-LLV024-A7"), "PL-LLV024-A7");
    assert.equal(extractAttributionCode("quiero un llavero"), null);
});
