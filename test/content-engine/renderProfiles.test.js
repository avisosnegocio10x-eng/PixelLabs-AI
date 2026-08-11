const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");

test("el Blueprint gratuito no puede crear disco ni cómputo pagado", () => {
    const free = fs.readFileSync(path.join(root, "render.free.yaml"), "utf8");
    assert.match(free, /plan:\s*free/);
    assert.match(free, /CONTENT_ENGINE_VIDEO_MODE[\s\S]*?value:\s*disabled/);
    assert.match(free, /REQUIRE_SUPABASE[\s\S]*?value:\s*"true"/);
    assert.match(free, /CONTENT_ENGINE_AUTO_PUBLISH[\s\S]*?value:\s*"false"/);
    assert.match(free, /LOCAL_WORKER_API_TOKEN[\s\S]*?generateValue:\s*true/);
    assert.match(free, /SOCIAL_EXTERNAL_REQUESTS_ENABLED[\s\S]*?value:\s*"false"/);
    assert.match(free, /autoDeployTrigger:\s*off/);
    assert.match(free, /healthCheckPath:\s*\/healthz/);
    assert.match(free, /dockerfilePath:\s*\.\/Dockerfile\.free/);
    assert.doesNotMatch(free, /^\s+disk:/m);
    assert.doesNotMatch(free, /plan:\s*(starter|standard|pro)/);

    const freeImage = fs.readFileSync(path.join(root, "Dockerfile.free"), "utf8");
    assert.doesNotMatch(freeImage, /ffmpeg|ffprobe/i);
});

test("el Blueprint de producción conserva Starter y su disco separado", () => {
    const production = fs.readFileSync(path.join(root, "render.yaml"), "utf8");
    assert.match(production, /plan:\s*starter/);
    assert.match(production, /CONTENT_ENGINE_VIDEO_MODE[\s\S]*?value:\s*local/);
    assert.match(production, /CONTENT_ENGINE_LOCAL_STORAGE_DURABLE[\s\S]*?value:\s*"true"/);
    assert.match(production, /LOCAL_WORKER_API_TOKEN[\s\S]*?generateValue:\s*true/);
    assert.match(production, /SOCIAL_EXTERNAL_REQUESTS_ENABLED[\s\S]*?value:\s*"false"/);
    assert.match(production, /disk:[\s\S]*?sizeGB:\s*10/);
    assert.match(production, /autoDeployTrigger:\s*off/);
    assert.match(production, /healthCheckPath:\s*\/healthz/);

    const productionImage = fs.readFileSync(path.join(root, "Dockerfile"), "utf8");
    assert.match(productionImage, /ffmpeg/);
});
