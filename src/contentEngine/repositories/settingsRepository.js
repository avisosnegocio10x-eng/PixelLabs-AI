const fs = require("fs/promises");
const path = require("path");
const { cloneDefaultSettings } = require("../config/defaults");
const {
    getSupabaseAdminClient,
    hasSupabaseConfiguration
} = require("../db/supabaseClient");

class SupabaseSettingsRepository {
    constructor(client = getSupabaseAdminClient()) {
        this.client = client;
    }

    async get() {
        const { data, error } = await this.client
            .from("content_settings")
            .select("settings")
            .eq("scope", "global")
            .maybeSingle();

        if (error) {
            throw new Error(`No se pudo leer content_settings: ${error.message}`);
        }

        return data?.settings || cloneDefaultSettings();
    }

    async save(settings) {
        const { data, error } = await this.client
            .from("content_settings")
            .upsert({
                scope: "global",
                settings,
                updated_at: new Date().toISOString()
            }, { onConflict: "scope" })
            .select("settings")
            .single();

        if (error) {
            throw new Error(`No se pudo guardar content_settings: ${error.message}`);
        }

        return data.settings;
    }
}

class FileSettingsRepository {
    constructor(filePath = path.resolve(
        process.env.CONTENT_ENGINE_WORK_DIR || "./storage/work",
        "content-settings.json"
    )) {
        this.filePath = filePath;
    }

    async get() {
        try {
            return JSON.parse(await fs.readFile(this.filePath, "utf8"));
        } catch (error) {
            if (error.code !== "ENOENT") {
                throw error;
            }

            return cloneDefaultSettings();
        }
    }

    async save(settings) {
        await fs.mkdir(path.dirname(this.filePath), { recursive: true });
        const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
        await fs.writeFile(temporaryPath, JSON.stringify(settings, null, 2));
        await fs.rename(temporaryPath, this.filePath);
        return settings;
    }
}

function createSettingsRepository() {
    if (hasSupabaseConfiguration()) {
        return new SupabaseSettingsRepository();
    }

    if (process.env.NODE_ENV === "production") {
        throw new Error(
            "SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son obligatorios en producción."
        );
    }

    return new FileSettingsRepository();
}

module.exports = {
    SupabaseSettingsRepository,
    FileSettingsRepository,
    createSettingsRepository
};
