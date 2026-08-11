const { getSupabaseAdminClient } = require("../db/supabaseClient");

async function checkSupabaseReadiness(options = {}) {
    const client = options.client || getSupabaseAdminClient();
    const bucket = options.bucket || process.env.SUPABASE_STORAGE_BUCKET || "pixellabs-content";
    if (!client) {
        return {
            databaseReachable: false,
            catalogReachable: false,
            storageReachable: false
        };
    }

    const [settings, product, storage] = await Promise.all([
        client.from("content_settings")
            .select("scope", { head: true, count: "exact" })
            .eq("scope", "global"),
        client.from("products")
            .select("reference", { head: true, count: "exact" })
            .eq("reference", "LLV-024"),
        client.storage.getBucket(bucket)
    ]);
    if (settings.error || Number(settings.count || 0) < 1) {
        throw Object.assign(new Error("La configuración persistente no está disponible."), {
            code: "SETTINGS_NOT_READY"
        });
    }
    if (product.error || Number(product.count || 0) < 1) {
        throw Object.assign(new Error("El catálogo persistente no está disponible."), {
            code: "CATALOG_NOT_READY"
        });
    }
    if (storage.error || !storage.data || storage.data.public !== false) {
        throw Object.assign(new Error("El bucket privado no está disponible."), {
            code: "PRIVATE_STORAGE_NOT_READY"
        });
    }
    return {
        databaseReachable: true,
        catalogReachable: true,
        storageReachable: true
    };
}

module.exports = {
    checkSupabaseReadiness
};
