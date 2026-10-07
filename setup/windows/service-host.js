// Managed local host. server.js and the deployed chatbot entry point remain unchanged.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { loadLocalEnvironment, loadWorkerEnvironment, fingerprint, redact } = require("./safety");
const root = path.resolve(__dirname, "../..");

async function main(service = process.argv[2], instance = process.argv[3], paused = process.argv.includes("--paused")) {
    if (!["backend", "worker"].includes(service) || !/^[a-f0-9-]{36}$/.test(instance || "")) throw new Error("Parametros de servicio invalidos.");
    const environment = service === 'worker' ? loadWorkerEnvironment(root) : loadLocalEnvironment(root);
    if (service === 'worker') {
        // Worker never loads the backend profile or receives provider/admin credentials.
        const names = Object.keys(require('dotenv').parse(fs.readFileSync(path.join(root, '.env.example'))));
        for (const name of new Set([...names, ...Object.keys(process.env)]))
            if (/TOKEN|SECRET|PASSWORD|PASS$|API_KEY|DB_URL|SUPABASE_URL|ENCRYPTION_KEY/i.test(name)) process.env[name] = '';
    }
    Object.assign(process.env, environment);
    if (service === 'backend') process.env.SUPABASE_DB_URL = '';
    process.chdir(root);
    // Write only sanitized process output; raw child stdout/stderr is never redirected to a log.
    fs.mkdirSync(path.join(root, "logs"), { recursive: true });
    const logPath = path.join(root, "logs", `${service}.txt`);
    const log = (...values) => fs.appendFileSync(logPath, `${new Date().toISOString()} ${redact(values.map(v =>
        typeof v === "string" ? v : JSON.stringify(v)).join(" "), process.env)}\n`);
    console.log = log; console.error = log; console.warn = log;
    const statePath = path.join(__dirname, "state", `${service}-health.json`);
    const abort = new AbortController();
    let server;
    let workerPromise;
    let stopping = false;
    let lastError = null;
    function heartbeat(status = "ready") {
        const temporary = `${statePath}.${process.pid}.tmp`;
        fs.writeFileSync(temporary, JSON.stringify({ service, instance, pid: process.pid, status,
            updatedAt: new Date().toISOString(), configuration: fingerprint(environment), paused,
            lastError, autoPublish: false, externalSocialRequests: 0 }));
        fs.renameSync(temporary, statePath);
    }
    async function stop() {
        if (stopping) return;
        stopping = true;
        clearInterval(timer);
        abort.abort();
        if (server) await new Promise(resolve => server.close(resolve));
        if (workerPromise) await workerPromise;
        heartbeat("stopped");
    }
    if (service === "backend") {
        const inContainer = process.env.PIXELLABS_CONTAINER_BACKEND === "true";
        server = require(path.join(root, "server")).createApp().listen(inContainer ? 3000 : Number(environment.PORT),
            inContainer ? "0.0.0.0" : "127.0.0.1");
        await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
    } else {
        for (const binary of ["ffmpeg", "ffprobe"]) execFileSync(binary, ["-version"], { stdio: "ignore", timeout: 15000 });
        const { validateConfiguration } = require(path.join(root, "scripts/localVideoWorker"));
        const config = validateConfiguration();
        workerPromise = require(path.join(root, "scripts/offlineVideoWorker")).runOfflineWorker(config, {
            signal: abort.signal, paused: () => paused,
            onError: error => { lastError = error.code || "LOCAL_VIDEO_FAILED"; log("Video pendiente de revision", lastError); },
            onProgress: () => heartbeat()
        });
        workerPromise.catch(() => { lastError = "WORKER_FAILED"; heartbeat("failed"); process.exitCode = 1; abort.abort(); });
    }
    heartbeat();
    const timer = setInterval(() => {
        if (fs.existsSync(path.join(__dirname, "state", `stop-${instance}`))) stop().catch(() => { process.exitCode = 1; });
        else if (!abort.signal.aborted) heartbeat();
        else if (!stopping) stop().catch(() => { process.exitCode = 1; });
    }, 2000);
    process.once("SIGINT", () => stop().catch(() => { process.exitCode = 1; }));
    process.once("SIGTERM", () => stop().catch(() => { process.exitCode = 1; }));
}
if (require.main === module) main().catch(() => { process.stderr.write("No se pudo iniciar el componente local. Ejecuta REPARAR-PIXELLABS.bat.\n"); process.exitCode = 1; });
module.exports = { main };
