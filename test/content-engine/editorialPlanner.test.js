const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { cloneDefaultSettings } = require("../../src/contentEngine/config/defaults");
const { FileCatalogRepository } = require("../../src/contentEngine/repositories/catalogRepository");
const { FileEditorialPlanRepository } = require("../../src/contentEngine/repositories/editorialPlanRepository");
const { EditorialPlannerService } = require("../../src/contentEngine/services/editorialPlannerService");

async function fixture(t, configure = settings => settings) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pixellabs-plan-"));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const settings = configure(cloneDefaultSettings());
    return new EditorialPlannerService({
        repository: new FileEditorialPlanRepository(path.join(directory, "plan.json")),
        catalog: new FileCatalogRepository(path.join(directory, "catalog.json")),
        trends: { listCandidates: async () => [] },
        settings: { getSettings: async () => settings }
    });
}

test("distribuye el plan diario sin publicar ni repetir el mismo minuto", async t => {
    const service = await fixture(t);
    const result = await service.createPlan({ date: "2026-08-11" });
    assert.equal(result.status, "PLAN_READY");
    assert.equal(result.slots.length, 9);
    assert.equal(new Set(result.slots.map(slot => slot.plannedFor)).size, 9);
    assert.ok(result.slots.every(slot => slot.status === "PROPOSED"));
    assert.ok(result.slots.every(slot => slot.metadata.autoPublish === false));
    for (let index = 4; index < result.slots.length; index += 1) {
        const lastFive = result.slots.slice(index - 4, index + 1).map(slot => slot.category);
        assert.ok(new Set(lastFive).size > 1);
    }
    const repeated = await service.createPlan({ date: "2026-08-11" });
    assert.equal(repeated.slots.length, 9);
});

test("respeta los días sin publicaciones", async t => {
    const service = await fixture(t, settings => {
        settings.restDays = [2];
        return settings;
    });
    const result = await service.createPlan({ date: "2026-08-11" });
    assert.equal(result.status, "REST_DAY");
    assert.deepEqual(result.slots, []);
});
