const test = require("node:test");
const assert = require("node:assert/strict");
const {
    validateWorkflowPayload,
    validateIdempotencyKey,
    normalizeAutomationPayload
} = require("../../src/contentEngine/services/workflowPayloadPolicy");

test("acepta payload n8n e idempotencia limitada", () => {
    assert.deepEqual(validateWorkflowPayload({
        source: "n8n",
        productReference: "LLV-024"
    }, { requireN8nSource: true }), {
        source: "n8n",
        productReference: "LLV-024"
    });
    assert.equal(
        validateIdempotencyKey("content-generation:execution-123", true),
        "content-generation:execution-123"
    );
});

test("desenvuelve el payload nativo de n8n sin permitir suplantar el origen", () => {
    assert.deepEqual(normalizeAutomationPayload({
        source: "n8n",
        requestedAt: "2026-08-10T12:00:00.000Z",
        n8nExecutionId: "execution-123",
        payload: { source: "tercero", productReference: "LLV-024" }
    }), {
        source: "n8n",
        requestedAt: "2026-08-10T12:00:00.000Z",
        n8nExecutionId: "execution-123",
        productReference: "LLV-024"
    });
    assert.throws(
        () => normalizeAutomationPayload({ source: "n8n", payload: "texto" }),
        error => error.code === "INVALID_AUTOMATION_PAYLOAD"
    );
});

test("rechaza orígenes, claves y estructuras inseguras", () => {
    assert.throws(
        () => validateWorkflowPayload({ source: "internet" }, { requireN8nSource: true }),
        error => error.code === "INVALID_AUTOMATION_SOURCE"
    );
    assert.throws(
        () => validateIdempotencyKey("bad key", true),
        error => error.code === "INVALID_IDEMPOTENCY_KEY"
    );
    assert.throws(
        () => validateWorkflowPayload({ value: "x".repeat(20_001) }),
        error => error.code === "INVALID_AUTOMATION_PAYLOAD"
    );
});
