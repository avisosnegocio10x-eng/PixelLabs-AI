const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    REQUIRED_RESOURCES,
    checkConnection,
    validateReadiness
} = require("../../n8n/local/verifyConnection");
const {
    EXPECTED_NAMES,
    loadWorkflows,
    verifyImportedWorkflows
} = require("../../n8n/local/verifyImportedWorkflows");

function readiness(overrides = {}) {
    return {
        ok: true,
        databaseReachable: true,
        catalogReachable: true,
        storageReachable: true,
        resources: Object.fromEntries(REQUIRED_RESOURCES.map(name => [name, {
            reachable: true,
            records: 0
        }])),
        serviceRoleExposedToN8n: false,
        autoPublish: false,
        humanApprovalRequired: true,
        ...overrides
    };
}

test("readiness de n8n exige Supabase y conserva las barreras", () => {
    const result = validateReadiness(readiness());
    assert.equal(result.resources, 9);
    assert.equal(result.autoPublish, false);
    assert.equal(result.humanApprovalRequired, true);
    assert.throws(() => validateReadiness(readiness({ autoPublish: true })));
    assert.throws(() => validateReadiness(readiness({ serviceRoleExposedToN8n: true })));
});

test("la conexion usa HTTPS, token dedicado y no lo imprime", async () => {
    let request;
    const fetchImpl = async (url, options) => {
        request = { url: String(url), options };
        return new Response(JSON.stringify(readiness()), {
            status: 200,
            headers: { "content-type": "application/json" }
        });
    };
    const result = await checkConnection({
        fetchImpl,
        apiUrl: "https://content.example.test",
        token: "n8n-token-dedicado-con-32-caracteres",
        attempts: 1
    });
    assert.equal(result.ok, true);
    assert.equal(request.url, "https://content.example.test/automation/readiness");
    assert.match(request.options.headers.authorization, /^Bearer /);
    await assert.rejects(() => checkConnection({
        fetchImpl,
        apiUrl: "http://content.example.test",
        token: "n8n-token-dedicado-con-32-caracteres"
    }));
});

test("el verificador importado exige exactamente 12 workflows inactivos", () => {
    const workflows = EXPECTED_NAMES.map((name, index) => ({
        id: String(index + 1),
        name,
        active: false
    }));
    assert.deepEqual(verifyImportedWorkflows(workflows), {
        ok: true,
        workflows: 12,
        active: 0
    });
    assert.throws(() => verifyImportedWorkflows([
        ...workflows.slice(0, 11),
        { ...workflows[11], active: true }
    ]));
});

test("el verificador usa los nombres exactos de los doce JSON aprobados", () => {
    const directory = path.resolve(__dirname, "../../n8n/workflows");
    const names = fs.readdirSync(directory)
        .filter(file => file.endsWith(".json"))
        .map(file => JSON.parse(fs.readFileSync(path.join(directory, file), "utf8")).name)
        .sort();
    assert.deepEqual(names, [...EXPECTED_NAMES].sort());
});

test("el cargador acepta exportaciones separadas de n8n", t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pixellabs-n8n-export-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    for (const [index, name] of EXPECTED_NAMES.entries()) {
        fs.writeFileSync(path.join(directory, `${index}.json`), JSON.stringify({
            id: String(index + 1),
            name,
            active: false
        }));
    }
    assert.equal(loadWorkflows(directory).length, 12);
});

test("el instalador no activa workflows y evita importaciones duplicadas", () => {
    const installer = fs.readFileSync(path.resolve(
        __dirname,
        "../../n8n/local/CONFIGURAR-N8N.ps1"
    ), "utf8");
    assert.match(installer, /pixellabs-workflows-v1/);
    assert.match(installer, /verifyImportedWorkflows\.js/);
    assert.match(installer, /verifyConnection\.js/);
    assert.doesNotMatch(installer, /activate|update:workflow/i);
});
