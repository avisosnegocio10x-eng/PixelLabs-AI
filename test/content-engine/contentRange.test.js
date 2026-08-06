const test = require("node:test");
const assert = require("node:assert/strict");
const {
    parseContentRange,
    mergeRanges,
    coveredBytes,
    isComplete
} = require("../../src/contentEngine/video/contentRange");

test("interpreta Content-Range y calcula el tamaño del fragmento", () => {
    assert.deepEqual(parseContentRange("bytes 8-15/20"), {
        start: 8,
        end: 15,
        total: 20,
        length: 8
    });
});

test("fusiona rangos contiguos y evita contar bytes duplicados", () => {
    const ranges = mergeRanges([
        { start: 4, end: 9 },
        { start: 0, end: 4 },
        { start: 7, end: 11 }
    ]);

    assert.deepEqual(ranges, [{ start: 0, end: 11 }]);
    assert.equal(coveredBytes(ranges), 12);
    assert.equal(isComplete(ranges, 12), true);
});

test("rechaza rangos inválidos", () => {
    assert.throws(
        () => parseContentRange("bytes 10-4/20"),
        /no es válido/
    );
});
