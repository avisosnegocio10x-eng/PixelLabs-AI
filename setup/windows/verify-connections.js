const fs = require("node:fs");
const path = require("node:path");
const { loadLocalEnvironment } = require("./safety");
const { withPostgres, verifyAndMigrate } = require("./database");

async function verifyGemini(environment, fetchImpl = fetch) {
    // GET model metadata, no generation, token-in-URL, billing or model changes.
    const model = environment.CONTENT_ENGINE_GEMINI_MODEL;
    if (!/^gemini-[a-z0-9.-]+$/.test(model || "")) throw new Error("GEMINI_MODEL_INVALID");
    const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}`, {
        headers: { "x-goog-api-key": environment.GEMINI_API_KEY }, redirect: "error", signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(`GEMINI_CONNECTION_FAILED_HTTP_${response.status}`);
    return { gemini: "OK", generationRequests: 0, aiEnabled: false, freeTierConfirmed: false };
}

async function main() {
    const root = path.resolve(__dirname, "../..");
    const environment = loadLocalEnvironment(root);
    Object.assign(process.env, environment);
    if (environment.SUPABASE_URL && environment.SUPABASE_SERVICE_ROLE_KEY) {
        const url = new URL(environment.SUPABASE_URL);
        if (url.protocol !== "https:" || !/\.(?:supabase\.co|supabase\.in|supabase\.red)$/i.test(url.hostname))
            throw new Error("SUPABASE_URL debe pertenecer al proyecto oficial existente.");
        if (environment.SUPABASE_DB_URL) {
            const report = await withPostgres(environment.SUPABASE_DB_URL, execute => verifyAndMigrate(environment, execute));
            console.log("Supabase SQL:", JSON.stringify(report));
        } else {
            console.log("ACTION REQUIRED: SUPABASE_DB_URL desde Supabase > Connect. Una service-role no permite verificar historial, indices y RLS por REST.");
        }
        await require(path.join(root, "scripts/verifySupabaseConnection")).main();
    } else console.log("ACTION REQUIRED: Supabase no conectado. El perfil offline utiliza almacenamiento local.");
    if (environment.GEMINI_API_KEY) console.log(JSON.stringify(await verifyGemini(environment)));
    else console.log("ACTION REQUIRED: GEMINI_API_KEY. La IA editorial sigue apagada.");
    const callbackSource = fs.readFileSync(path.join(root, "src/routes/socialOAuthRoutes.js"), "utf8");
    const adminSource = fs.readFileSync(path.join(root, "src/contentEngine/routes/contentEngineRoutes.js"), "utf8");
    if (!callbackSource.includes('"/:provider/callback"') || !adminSource.includes('"/social/oauth/:provider/start"')) throw new Error("OAUTH_ROUTES_MISSING");
    console.log("Meta/TikTok: rutas preparadas. OAuth desactivado. Solicitudes sociales reales: 0.");
}
if (require.main === module) main().catch(error => {
    // Provider/DB responses can embed secrets. Print only our controlled code or a generic action.
    console.error("ACTION REQUIRED: no se pudo verificar una conexion configurada. Revisa sus valores solo en local.env.");
    if (/^(GEMINI_|POSTGRES_)[A-Z0-9_]+$/.test(error.message)) console.error(error.message);
    if (error.message.startsWith('ACTION REQUIRED:')) console.error(error.message);
    process.exitCode = 1;
});
module.exports = { main, verifyGemini };
