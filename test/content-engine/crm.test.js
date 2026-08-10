const test = require("node:test");
const assert = require("node:assert/strict");
const {
    normalizePlatform,
    mapContact,
    mapConversationMessage
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

test("reconstruye el contexto conversacional persistente para el chatbot", () => {
    assert.deepEqual(mapConversationMessage({
        role: "agent",
        body: "Tu cotización está en revisión.",
        occurred_at: "2026-08-10T12:00:00.000Z"
    }), {
        role: "assistant",
        message: "Tu cotización está en revisión.",
        timestamp: Date.parse("2026-08-10T12:00:00.000Z")
    });
});
