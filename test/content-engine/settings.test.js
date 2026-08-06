const test = require("node:test");
const assert = require("node:assert/strict");
const { cloneDefaultSettings } = require("../../src/contentEngine/config/defaults");
const {
    ContentSettingsService
} = require("../../src/contentEngine/services/contentSettingsService");

class InMemoryRepository {
    constructor(initial = cloneDefaultSettings()) {
        this.value = initial;
    }

    async get() {
        return this.value;
    }

    async save(value) {
        this.value = value;
        return value;
    }
}

test("la configuración inicial mantiene aprobación manual y publicación apagada", async () => {
    const service = new ContentSettingsService(new InMemoryRepository());
    const settings = await service.getSettings();

    assert.equal(settings.approvalMode, "manual");
    assert.equal(settings.autoPublish, false);
    assert.equal(settings.dailyTargets.staticPosts, 4);
    assert.equal(settings.dailyTargets.reels, 1);
    assert.equal(settings.dailyTargets.stories, 2);
});

test("permite elegir cantidades diarias sin fijarlas en el código", async () => {
    const service = new ContentSettingsService(new InMemoryRepository());
    const settings = await service.updateSettings({
        dailyTargets: {
            staticPosts: 5,
            reels: 2
        }
    });

    assert.equal(settings.dailyTargets.staticPosts, 5);
    assert.equal(settings.dailyTargets.reels, 2);
    assert.equal(settings.dailyTargets.stories, 2);
});

test("rechaza umbrales de aprobación incoherentes", async () => {
    const service = new ContentSettingsService(new InMemoryRepository());

    await assert.rejects(
        () => service.updateSettings({
            thresholds: {
                humanApproval: 96,
                automaticApproval: 95
            }
        }),
        /umbral humano/
    );
});

test("impide publicación automática mientras la aprobación sea manual", async () => {
    const service = new ContentSettingsService(new InMemoryRepository());

    await assert.rejects(
        () => service.updateSettings({ autoPublish: true }),
        /modo manual/
    );
});

test("el interruptor de emergencia apaga motor y publicación", async () => {
    const initial = cloneDefaultSettings();
    initial.approvalMode = "partial";
    initial.autoPublish = true;
    const service = new ContentSettingsService(new InMemoryRepository(initial));

    const settings = await service.setEmergencyStop(true);

    assert.equal(settings.enabled, false);
    assert.equal(settings.autoPublish, false);
});
