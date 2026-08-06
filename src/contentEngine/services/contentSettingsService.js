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
            mergeSettings(cloneDefaultSettings(), stored)
        );
    }

    async updateSettings(changes) {
        const current = await this.getSettings();
        const candidate = mergeSettings(current, changes);
        const validated = contentSettingsSchema.parse(candidate);
        return this.repository.save(validated);
    }

    async setEmergencyStop(stopped) {
        return this.updateSettings({
            enabled: !stopped,
            autoPublish: stopped ? false : undefined
        });
    }
}

module.exports = {
    ContentSettingsService,
    mergeSettings
};
