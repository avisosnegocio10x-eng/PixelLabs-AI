// Runs the existing JSONs in an isolated n8n instance and an isolated local backend.
// No production credentials, AI calls, social calls or activation are used.
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { verifyImportedWorkflows } = require("./verifyImportedWorkflows");

async function main() {
    const root = path.resolve(__dirname, "../..");
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pixellabs-n8n-smoke-"));
    const token = crypto.randomBytes(32).toString("hex");
    Object.assign(process.env, {
        NODE_ENV: "test", REQUIRE_SUPABASE: "false", CONTENT_ENGINE_AUTO_PUBLISH: "false", AUTO_PUBLICATION: "false",
        CONTENT_ENGINE_AI_ENABLED: "false", SOCIAL_OAUTH_ENABLED: "false", SOCIAL_PUBLISH_MODE: "draft",
        SOCIAL_EXTERNAL_REQUESTS_ENABLED: "false", CONTENT_ENGINE_VIDEO_MODE: "disabled",
        CONTENT_ENGINE_WORK_DIR: path.join(directory, "backend"),
        CONTENT_ENGINE_UPLOAD_DIR: path.join(directory, "uploads"),
        N8N_WEBHOOK_SECRET: token, N8N_REQUIRE_HTTPS: "false", ADMIN_API_TOKEN: crypto.randomBytes(32).toString("hex"),
        LOCAL_WORKER_API_TOKEN: crypto.randomBytes(32).toString("hex")
    });
    for (const name of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GEMINI_API_KEY", "META_APP_SECRET", "TIKTOK_CLIENT_SECRET"])
        process.env[name] = ""; // Do not let dotenv reload production credentials from a legacy .env.
    const env = { ...process.env, NODE_ENV: "production", N8N_USER_FOLDER: path.join(directory, "n8n"),
        N8N_ENCRYPTION_KEY: crypto.randomBytes(32).toString("hex"), N8N_DIAGNOSTICS_ENABLED: "false",
        N8N_BLOCK_ENV_ACCESS_IN_NODE: "false", N8N_RUNNERS_ENABLED: "false", N8N_LOG_LEVEL: "info" };
    const binary = process.env.N8N_QA_BINARY || "n8n";
    const run = args => new Promise((resolve, reject) => {
        const child = spawn(binary, args, { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
        let output = "";
        child.stdout.on("data", data => { output += data; });
        child.stderr.on("data", data => { output += data; });
        const timer = setTimeout(() => child.kill(), 90000);
        child.once("error", error => { clearTimeout(timer); reject(error); });
        child.once("exit", code => { clearTimeout(timer);
            code === 0 ? resolve(output) : reject(new Error(`n8n ${args[0]} falló: ${output.slice(-1500)}`)); });
    });
    let server;
    try {
        if (!(await run(["--version"])).includes("2.33.7")) throw new Error("Esta prueba requiere n8n 2.33.7.");
        const exported = path.join(directory, "export");
        await fs.mkdir(exported);
        await run(["import:workflow", "--separate", "--input", path.join(root, "n8n/workflows")]);
        await run(["export:workflow", "--all", "--separate", "--output", exported]);
        const workflows = [];
        for (const file of await fs.readdir(exported)) {
            const value = JSON.parse(await fs.readFile(path.join(exported, file), "utf8"));
            workflows.push(...(Array.isArray(value) ? value : [value]));
        }
        verifyImportedWorkflows(workflows);
        const { createApp } = require(path.join(root, "server"));
        server = createApp().listen(0, "127.0.0.1");
        await once(server, "listening");
        env.PIXELLABS_API_URL = `http://127.0.0.1:${server.address().port}`;
        env.PIXELLABS_N8N_API_TOKEN = token;
        for (const workflow of workflows.sort((a, b) => a.name.localeCompare(b.name))) {
            const output = await run(["execute", "--id", workflow.id, "--rawOutput"]);
            if (!output.includes("Consultar resultado")) throw new Error(`Sin seguimiento: ${workflow.name}`);
            console.log(`OK: ${workflow.name}`);
        }
        const { FileWorkflowJobRepository } = require(path.join(root, "src/contentEngine/repositories/workflowJobRepository"));
        const jobs = await new FileWorkflowJobRepository().listByStatuses(["QUEUED", "COMPLETED", "FAILED"]);
        const completed = jobs.filter(job => job.status === "COMPLETED").length;
        const localWorkerQueued = jobs.filter(job => job.status === "QUEUED" && job.executionTarget === "local-video").length;
        if (jobs.length !== 12 || completed !== 10 || localWorkerQueued !== 2) throw new Error("Estados de backend inesperados.");
        console.log(JSON.stringify({ n8nVersion: "2.33.7", workflows: 12, active: 0, completed, localWorkerQueued,
            aiRequests: 0, externalSocialRequests: 0 }));
    } finally {
        if (server) await new Promise(resolve => server.close(resolve));
        await fs.rm(directory, { recursive: true, force: true });
    }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { main };
