const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const dotenv = require("dotenv");

const SAFE_FLAGS = Object.freeze({ AUTO_PUBLICATION: "false", CONTENT_ENGINE_AUTO_PUBLISH: "false",
    SOCIAL_PUBLISH_MODE: "draft", SOCIAL_EXTERNAL_REQUESTS_ENABLED: "false", SOCIAL_OAUTH_ENABLED: "false",
    CONTENT_ENGINE_AI_ENABLED: "false" });
const SECRET_NAMES = Object.freeze(["ADMIN_API_TOKEN", "LOCAL_WORKER_API_TOKEN", "N8N_WEBHOOK_SECRET",
    "N8N_ENCRYPTION_KEY", "SOCIAL_TOKEN_ENCRYPTION_KEY"]);

function assertSafeFlags(environment, requireAll = false) {
    for (const [key, expected] of Object.entries(SAFE_FLAGS)) {
        if ((requireAll || Object.hasOwn(environment, key)) && environment[key] !== expected) {
            throw new Error(`Configuracion insegura: ${key} debe ser ${expected}.`);
        }
    }
}
function assertSecrets(environment) {
    const values = SECRET_NAMES.map(key => environment[key]);
    if (values.some(value => !value || value.length < 32 || /REEMPLAZAR|replace-with/i.test(value)))
        throw new Error("Faltan secretos locales validos.");
    if (new Set(values).size !== values.length) throw new Error("Los secretos locales deben ser diferentes.");
    const value = environment.SOCIAL_TOKEN_ENCRYPTION_KEY;
    if (!/^[A-Za-z0-9+/]{43}=$/.test(value) || Buffer.from(value, "base64").length !== 32 ||
        Buffer.from(value, "base64").toString("base64") !== value) throw new Error("Clave social invalida: se requieren 32 bytes en base64.");
}
function redact(value, environment = process.env) {
    let text = String(value);
    for (const [name, secret] of Object.entries(environment)) {
        if (/(TOKEN|SECRET|PASSWORD|PASS$|API_KEY|ENCRYPTION_KEY|SERVICE_ROLE|DB_URL)/i.test(name) && secret && secret.length >= 4)
            text = text.split(secret).join("[REDACTED]");
    }
    return text.replace(/(Bearer\s+)\S+/gi, "$1[REDACTED]")
        .replace(/((?:token|secret|password|api[_-]?key|service[_-]?role[_-]?key)\s*[=:]\s*)\S+/gi, "$1[REDACTED]")
        .replace(/postgres(?:ql)?:\/\/\S+/gi, "[REDACTED_DB_URL]");
}
function loadLocalEnvironment(root, inherited = process.env) {
    // Check inherited and legacy values before loading the separate profile.
    assertSafeFlags(inherited);
    const legacyPath = path.join(root, ".env");
    if (fs.existsSync(legacyPath)) assertSafeFlags(dotenv.parse(fs.readFileSync(legacyPath)));
    const environment = dotenv.parse(fs.readFileSync(path.join(root, "setup/windows/local.env")));
    assertSafeFlags(environment, true);
    assertSecrets(environment);
    if (environment.NODE_ENV !== "development" || environment.CONTENT_ENGINE_VIDEO_MODE !== "local")
        throw new Error("El perfil debe seguir siendo local y de desarrollo.");
    if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(environment.APP_BASE_URL)) throw new Error("La URL del backend debe ser local.");
    return environment;
}
function fingerprint(environment) {
    return crypto.createHash("sha256").update(JSON.stringify(environment)).digest("hex");
}
function loadWorkerEnvironment(root, inherited = process.env) {
    assertSafeFlags(inherited);
    const worker = dotenv.parse(fs.readFileSync(path.join(root, 'setup/windows/worker.env')));
    assertSafeFlags(worker);
    for (const key of Object.keys(worker)) if (!key.startsWith('LOCAL_WORKER_') && !Object.hasOwn(SAFE_FLAGS, key))
        throw new Error('El perfil del worker contiene variables de otro servicio. Revisalo localmente.');
    if (worker.LOCAL_WORKER_MODE !== 'offline' || !worker.LOCAL_WORKER_API_TOKEN || worker.LOCAL_WORKER_API_TOKEN.length < 32 ||
        !/^http:\/\/127\.0\.0\.1:\d+$/.test(worker.LOCAL_WORKER_API_URL)) throw new Error('Perfil offline del worker invalido.');
    return { ...worker, ...SAFE_FLAGS };
}
module.exports = { SAFE_FLAGS, SECRET_NAMES, assertSafeFlags, assertSecrets, redact, loadLocalEnvironment, loadWorkerEnvironment, fingerprint };
