const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { FileCatalogRepository } = require("../../src/contentEngine/repositories/catalogRepository");

test("consulta el producto real por referencia y respeta disponibilidad", async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pixellabs-catalog-"));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const repository = new FileCatalogRepository(path.join(directory, "catalog.json"));

    const product = await repository.getByReference("llv-024");
    assert.equal(product.reference, "LLV-024");
    assert.equal(product.priceFrom, 2.5);
    assert.equal(product.metadata.maxColors, 4);

    await repository.update("LLV-024", { availabilityStatus: "OUT_OF_STOCK" });
    assert.equal((await repository.list({ promotableOnly: true })).length, 0);
});

test("el enfriamiento impide seleccionar un producto para promoción", async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pixellabs-catalog-"));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const repository = new FileCatalogRepository(path.join(directory, "catalog.json"));
    await repository.update("LLV-024", {
        promotionBlockedUntil: new Date(Date.now() + 86400000).toISOString()
    });
    assert.deepEqual(await repository.list({ promotableOnly: true }), []);
});
