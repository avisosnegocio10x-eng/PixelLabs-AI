const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { validSignature } = require("../../src/middleware/metaWebhookAuth");

test("acepta una firma sha256 auténtica de Meta", () => {
    const body = Buffer.from('{"object":"page"}');
    const secret = "test-only-secret";
    const signature = `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
    assert.equal(validSignature(body, signature, secret), true);
});

test("rechaza cuerpo alterado, firma inválida o secretos ausentes", () => {
    const body = Buffer.from("original");
    const secret = "test-only-secret";
    const signature = `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
    assert.equal(validSignature(Buffer.from("alterado"), signature, secret), false);
    assert.equal(validSignature(body, "sha256=bad", secret), false);
    assert.equal(validSignature(body, signature, ""), false);
});
