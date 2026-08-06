const { ZodError } = require("zod");
const { ContentSettingsService } = require("../services/contentSettingsService");

function createSettingsController(service = new ContentSettingsService()) {
    return {
        get: async (req, res, next) => {
            try {
                res.json({ ok: true, settings: await service.getSettings() });
            } catch (error) {
                next(error);
            }
        },

        update: async (req, res, next) => {
            try {
                const settings = await service.updateSettings(req.body || {});
                res.json({ ok: true, settings });
            } catch (error) {
                if (error instanceof ZodError) {
                    return res.status(422).json({
                        ok: false,
                        error: "INVALID_CONTENT_SETTINGS",
                        issues: error.issues
                    });
                }
                next(error);
            }
        },

        emergencyStop: async (req, res, next) => {
            try {
                const settings = await service.setEmergencyStop(true);
                res.json({ ok: true, settings });
            } catch (error) {
                next(error);
            }
        }
    };
}

module.exports = {
    createSettingsController
};
