const { cloneDefaultSettings } = require("../config/defaults");
const { contentSettingsSchema } = require("../config/settingsSchema");
const { createSettingsRepository } = require("../repositories/settingsRepository");

function mergeSettings(current, changes) {
    return {
        ...current,
        ...changes,
        thresholds: {
            ...current.thresholds,
            ...changes.thresholds
        },
        dailyTargets: {
            ...current.dailyTargets,
            ...changes.dailyTargets
        },
        platformAutomation: {
            ...current.platformAutomation,
            ...changes.platformAutomation
        },
        preferredTimes: {
            ...current.preferredTimes,
            ...changes.preferredTimes
        },
        video: {
            ...current.video,
            ...changes.video
        }
    };
}

class ContentSettingsService {
    constructor(repository = createSettingsRepository()) {
        this.repository = repository;
    }

    async getSettings() {
        const stored = await this.repository.get();
        return contentSettingsSchema.parse(
            { ...mergeSettings(cloneDefaultSettings(), stored), autoPublish: false, approvalMode: "manual",
                platformAutomation: { facebook: false, instagram: false, tiktok: false } }
        );
    }

    async updateSettings(changes) {
        if (changes.autoPublish === true || (changes.approvalMode && changes.approvalMode !== "manual") ||
            Object.values(changes.platformAutomation || {}).some(value => value === true)) {
            throw Object.assign(new Error("Esta etapa exige modo manual y publicación automática apagada."), {
                statusCode: 409, code: "AUTOMATIC_PUBLICATION_LOCKED"
            });
        }
        const current = await this.getSettings();
        const candidate = mergeSettings(current, changes);
        const validated = contentSettingsSchema.parse(candidate);
        return this.repository.save(validated);
    }

    async setEmergencyStop(stopped) {
        return this.updateSettings({
            enabled: !stopped,
            autoPublish: false
        });
    }
}

module.exports = {
    ContentSettingsService,
    mergeSettings
};
