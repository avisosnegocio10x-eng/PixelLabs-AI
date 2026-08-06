require("dotenv").config({ quiet: true });
const { getSupabaseAdminClient, hasSupabaseConfiguration } = require("../src/contentEngine/db/supabaseClient");

async function main() {
    if (!hasSupabaseConfiguration()) {
        throw new Error("Configura SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno.");
    }
    const client = getSupabaseAdminClient();
    const requiredTables = [
        "content_settings",
        "products",
        "content_items",
        "source_videos",
        "video_clips",
        "crm_contacts",
        "crm_messages",
        "workflow_jobs"
    ];
    for (const table of requiredTables) {
        const { error } = await client.from(table).select("*", { head: true, count: "exact" }).limit(1);
        if (error) throw new Error(`La tabla ${table} no está lista: ${error.message}`);
    }
    const { data: settings, error: settingsError } = await client.from("content_settings")
        .select("settings").eq("scope", "global").single();
    if (settingsError) throw settingsError;
    if (settings.settings.autoPublish !== false || settings.settings.approvalMode !== "manual") {
        throw new Error("La configuración inicial no mantiene aprobación manual y publicación apagada.");
    }
    const { data: product, error: productError } = await client.from("products")
        .select("reference,availability_status").eq("reference", "LLV-024").single();
    if (productError) throw productError;
    const bucketName = process.env.SUPABASE_STORAGE_BUCKET || "pixellabs-content";
    const { data: buckets, error: bucketError } = await client.storage.listBuckets();
    if (bucketError) throw bucketError;
    if (!(buckets || []).some(bucket => bucket.name === bucketName && bucket.public === false)) {
        throw new Error(`Falta el bucket privado ${bucketName}.`);
    }
    console.log(`Supabase verificado: ${requiredTables.length} tablas, ${product.reference} y bucket privado.`);
}

main().catch(error => {
    console.error(`Verificación de Supabase fallida: ${error.message}`);
    process.exitCode = 1;
});
