const test = require("node:test");
const assert = require("node:assert/strict");
const { safeEqual } = require("../../src/middleware/adminAuth");

test("la comparación de tokens acepta coincidencias exactas", () => {
    assert.equal(safeEqual("token-seguro", "token-seguro"), true);
});

test("la comparación de tokens rechaza valores diferentes y vacíos", () => {
    assert.equal(safeEqual("token", "otro-token"), false);
    assert.equal(safeEqual("", "token"), false);
});
