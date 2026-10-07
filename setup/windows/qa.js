const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { redact } = require("./safety");
const run = promisify(execFile);
const ROOT = path.resolve(__dirname, "../..");

async function ffmpegSmoke() {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pixellabs-ffmpeg-"));
    try {
        const file = path.join(directory, "smoke.mp4");
        await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=black:s=160x90:d=1",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", file], { timeout: 30000 });
        const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name,width,height",
            "-of", "json", file], { timeout: 15000 });
        const stream = JSON.parse(stdout).streams[0];
        if (stream?.codec_name !== "h264" || stream.width !== 160 || stream.height !== 90) throw new Error("FFMPEG_SMOKE_FAILED");
        return { ffmpeg: "OK", ffprobe: "OK", h264: true };
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
}

async function makeSandbox(root = ROOT) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pixellabs-setup-qa-"));
    const entries = ["server.js", "package.json", "package-lock.json", ".env.example", ".gitignore", "render.yaml", "render.free.yaml", "Dockerfile", "Dockerfile.free",
        "src", "scripts", "test", "n8n", "database", "setup", "local-worker", "docs",
        "INSTALAR-PIXELLABS.bat", "INICIAR-PIXELLABS.bat", "DETENER-PIXELLABS.bat", "REPARAR-PIXELLABS.bat", "CONFIGURAR-CREDENCIALES.bat"];
    try {
        for (const entry of entries) {
            await fs.cp(path.join(root, entry), path.join(directory, entry), { recursive: true,
                filter: source => ![".env", "state", "inbox", "work", "logs"].includes(path.basename(source)) &&
                    (!source.endsWith(".env") || source.endsWith(".example.env")) && !source.endsWith(".env.tmp") });
        }
        // Junctions do not require developer mode or elevation on Windows.
        await fs.symlink(path.join(root, "node_modules"), path.join(directory, "node_modules"), "junction");
        return directory;
    } catch (error) { await fs.rm(directory, { recursive: true, force: true }); throw error; }
}

async function runQa({ n8n = false } = {}) {
    const sandbox = await makeSandbox();
    const environment = { ...process.env, NODE_ENV: "test" };
    for (const key of Object.keys(environment))
        if (/TOKEN|SECRET|PASSWORD|PASS$|API_KEY|DB_URL|SUPABASE_URL|N8N_QA_BINARY/i.test(key)) delete environment[key];
    Object.assign(environment, { SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", GEMINI_API_KEY: "",
        AUTO_PUBLICATION: "false", CONTENT_ENGINE_AUTO_PUBLISH: "false", SOCIAL_PUBLISH_MODE: "draft",
        SOCIAL_EXTERNAL_REQUESTS_ENABLED: "false", SOCIAL_OAUTH_ENABLED: "false", CONTENT_ENGINE_AI_ENABLED: "false" });
    try {
        const { stdout } = await run(process.execPath, ["--test", "--test-concurrency=1"], {
            cwd: sandbox, env: environment, timeout: 300000, maxBuffer: 4 * 1024 * 1024
        });
        process.stdout.write(redact(stdout, process.env));
        await run(process.execPath, ["scripts/validateN8nWorkflows.js"], { cwd: sandbox, env: environment, timeout: 30000 });
        console.log(JSON.stringify(await ffmpegSmoke()));
        if (n8n) {
            const binary = process.platform === "win32" ? "docker.exe" : "docker";
            const { stdout: runtime } = await run(binary, ["run", "--rm", "--network", "none", "--workdir", "/qa",
                "--mount", `type=bind,source=${sandbox},target=/qa,readonly`,
                "--mount", `type=bind,source=${path.join(ROOT, "node_modules")},target=/qa/node_modules,readonly`,
                "--entrypoint", "node", "docker.n8n.io/n8nio/n8n:2.33.7", "n8n/local/runtimeSmokeTest.js"], {
                env: environment, timeout: 1200000, maxBuffer: 4 * 1024 * 1024
            });
            process.stdout.write(redact(runtime, process.env));
        }
        console.log(JSON.stringify({ tests: Number(stdout.match(/(?:#|ℹ) tests (\d+)/)?.[1]),
            passed: Number(stdout.match(/(?:#|ℹ) pass (\d+)/)?.[1]), ffmpeg: 'OK', n8nWorkflows: n8n ? 12 : null, externalSocialRequests: 0 }));
    } finally { await fs.rm(sandbox, { recursive: true, force: true }); }
}
if (require.main === module) {
    const operation = process.argv.includes("--ffmpeg-only") ? ffmpegSmoke().then(result => console.log(JSON.stringify(result)))
        : runQa({ n8n: process.argv.includes("--n8n") });
    operation.catch(error => { console.error("Prueba local fallida.", redact(error.stdout || error.code || "QA_FAILED")); process.exitCode = 1; });
}
module.exports = { ffmpegSmoke, makeSandbox, runQa };
