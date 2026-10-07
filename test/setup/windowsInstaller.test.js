const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { SAFE_FLAGS, SECRET_NAMES, assertSafeFlags, assertSecrets, redact, loadLocalEnvironment, loadWorkerEnvironment } = require('../../setup/windows/safety');
const { processOfflineInbox } = require('../../scripts/offlineVideoWorker');
const { findMissing } = require('../../n8n/local/prepareMissingWorkflows');
const { EXPECTED_NAMES } = require('../../n8n/local/verifyImportedWorkflows');
const { makeSandbox, ffmpegSmoke } = require('../../setup/windows/qa');
const { verifyGemini } = require('../../setup/windows/verify-connections');

function environment() {
    return { ...SAFE_FLAGS, ...Object.fromEntries(SECRET_NAMES.map(name => [name, crypto.randomBytes(32).toString('base64')])),
        NODE_ENV: 'development', CONTENT_ENGINE_VIDEO_MODE: 'local', APP_BASE_URL: 'http://127.0.0.1:3000' };
}

test('installer rejects every unsafe publication, OAuth and AI flag, including noncanonical values', () => {
    assert.doesNotThrow(() => assertSafeFlags(SAFE_FLAGS, true));
    for (const key of Object.keys(SAFE_FLAGS)) {
        for (const value of ['true', 'TRUE', '1', 'live', 'false #comment']) assert.throws(() => assertSafeFlags({ ...SAFE_FLAGS, [key]: value }, true));
        const missing = { ...SAFE_FLAGS }; delete missing[key]; assert.throws(() => assertSafeFlags(missing, true));
    }
});
test('installer validates five different random secrets and the exact social cipher format', () => {
    const config = environment(); assert.doesNotThrow(() => assertSecrets(config));
    assert.throws(() => assertSecrets({ ...config, N8N_WEBHOOK_SECRET: config.ADMIN_API_TOKEN }));
    for (const value of ['', 'replace-with-a-long-random-value', crypto.randomBytes(31).toString('base64'), 'a'.repeat(44)])
        assert.throws(() => assertSecrets({ ...config, SOCIAL_TOKEN_ENCRYPTION_KEY: value }));
});
test('logs redact keys from environment, Authorization headers and PostgreSQL URLs', () => {
    const config = { GEMINI_API_KEY: 'sample-key-for-test', SUPABASE_SERVICE_ROLE_KEY: 'sample-role-for-test', EMAIL_PASS: 'sample-email-for-test' };
    const result = redact(`${Object.values(config).join(' ')} Bearer abcdef password=hello postgresql://user:private@host/db`, config);
    for (const secret of [...Object.values(config), 'abcdef', 'hello', 'private']) assert.ok(!result.includes(secret));
});
test('separate local profile does not override an unsafe inherited or legacy configuration', async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pixellabs-env-test-'));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    await fs.mkdir(path.join(directory, 'setup/windows'), { recursive: true });
    const config = environment();
    await fs.writeFile(path.join(directory, 'setup/windows/local.env'), Object.entries(config).map(([key, val]) => `${key}=${val}`).join('\n'));
    assert.equal(loadLocalEnvironment(directory, {}).AUTO_PUBLICATION, 'false');
    assert.throws(() => loadLocalEnvironment(directory, { SOCIAL_OAUTH_ENABLED: 'true' }));
    await fs.writeFile(path.join(directory, '.env'), 'AUTO_PUBLICATION=true\n');
    assert.throws(() => loadLocalEnvironment(directory, {}));
    assert.equal(await fs.readFile(path.join(directory, '.env'), 'utf8'), 'AUTO_PUBLICATION=true\n');
});
test('workflow repair imports only missing names and preserves IDs and edits', () => {
    const source = EXPECTED_NAMES.map((name, index) => ({ name, id: String(index), active: false }));
    const existing = source.slice(0, 10).map(flow => ({ ...flow, id: `local-${flow.id}`, custom: 'preserve' }));
    const snapshot = structuredClone(existing);
    assert.deepEqual(findMissing(existing, source).map(flow => flow.name), EXPECTED_NAMES.slice(10));
    assert.deepEqual(existing, snapshot);
    assert.equal(findMissing(source, source).length, 0);
    assert.throws(() => findMissing([...existing, existing[0]], source));
    assert.throws(() => findMissing([{ ...source[0], active: true }], source));
    assert.throws(() => findMissing([{ name: 'Other app', active: false }], source));
});
test('worker reads only its dedicated profile and rejects backend/provider secrets', async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pixellabs-worker-env-'));
    t.after(() => fs.rm(directory, {recursive:true,force:true}));
    await fs.mkdir(path.join(directory,'setup/windows'),{recursive:true});
    const file=path.join(directory,'setup/windows/worker.env');
    const config=`LOCAL_WORKER_MODE=offline\nLOCAL_WORKER_API_URL=http://127.0.0.1:3000\nLOCAL_WORKER_API_TOKEN=${crypto.randomBytes(32).toString('hex')}\n`;
    await fs.writeFile(file,config);
    const result=loadWorkerEnvironment(directory,{});
    assert.equal(result.SUPABASE_SERVICE_ROLE_KEY,undefined); assert.equal(result.ADMIN_API_TOKEN,undefined);
    await fs.writeFile(file,config+'SUPABASE_SERVICE_ROLE_KEY=private-backend-only\n');
    assert.throws(()=>loadWorkerEnvironment(directory,{}));
});
test('offline worker processes once, resumes after restart and never calls an API', async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pixellabs-offline-worker-'));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const config = { inboxRoot: path.join(directory, 'inbox'), workRoot: path.join(directory, 'work') };
    await fs.mkdir(config.inboxRoot); await fs.mkdir(config.workRoot);
    await fs.writeFile(path.join(config.inboxRoot, 'real.mp4'), 'local test source');
    let calls = 0;
    const processor = { process: async () => { calls++; return { artifacts: [], analysis: { clips: [] } }; } };
    const options = { processor, stableMs: 0 };
    assert.equal((await processOfflineInbox(config, options)).completed, 1);
    assert.equal((await processOfflineInbox(config, options)).completed, 0);
    assert.equal(calls, 1);
    assert.equal(await fs.readFile(path.join(config.inboxRoot, 'real.mp4'), 'utf8'), 'local test source');
    const draft = JSON.parse(await fs.readFile(path.join(config.workRoot,
        (await fs.readdir(config.workRoot)).find(file => file.endsWith('-draft.json'))), 'utf8'));
    assert.equal(draft.status, 'DRAFT'); assert.equal(draft.requiresHumanApproval, true); assert.equal(draft.externalRequestsSent, 0);
});
test('offline worker retains failed jobs, avoids immediate retry and skips files still being copied', async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pixellabs-offline-failure-'));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const config = { inboxRoot: path.join(directory, 'inbox'), workRoot: path.join(directory, 'work') };
    await fs.mkdir(config.inboxRoot); await fs.mkdir(config.workRoot); await fs.writeFile(path.join(config.inboxRoot, 'real.mp4'), 'source');
    let calls = 0; const processor = { process: async () => { calls++; throw Object.assign(new Error('private test content'), { code: 'TEST_FAIL' }); } };
    assert.equal((await processOfflineInbox(config, { processor })).completed, 0); assert.equal(calls, 0);
    await processOfflineInbox(config, { processor, stableMs: 0 }); await processOfflineInbox(config, { processor, stableMs: 0 });
    assert.equal(calls, 1);
    const state = await fs.readFile(path.join(config.workRoot, 'offline-jobs.json'), 'utf8');
    assert.match(state, /TEST_FAIL/); assert.ok(!state.includes('private test content'));
});
test('Gemini connection checks only free model metadata and does not generate content', async () => {
    let request;
    const result = await verifyGemini({ GEMINI_API_KEY: 'private-key-test', CONTENT_ENGINE_GEMINI_MODEL: 'gemini-3.5-flash-lite' }, async (url, options) => {
        request = { url, options }; return { ok: true };
    });
    assert.ok(!request.url.includes('private-key-test')); assert.ok(!request.url.includes('generateContent'));
    assert.equal(request.options.headers['x-goog-api-key'], 'private-key-test'); assert.equal(request.options.redirect, 'error');
    assert.equal(result.generationRequests, 0); assert.equal(result.aiEnabled, false);
});
test('QA sandbox excludes credentials, inboxes, state and source videos', async t => {
    const sandbox = await makeSandbox(); t.after(() => fs.rm(sandbox, { recursive: true, force: true }));
    for (const file of ['.env', 'setup/windows/local.env', 'setup/windows/state', 'n8n/local/config.env', 'local-worker/.env', 'local-worker/inbox'])
        await assert.rejects(fs.access(path.join(sandbox, file)));
    await fs.access(path.join(sandbox, 'n8n/workflows/01-daily-trend-research.json'));
    await fs.access(path.join(sandbox, 'node_modules/express'));
});
test('FFmpeg and ffprobe produce and inspect a real local H.264 smoke video', async () => {
    assert.deepEqual(await ffmpegSmoke(), { ffmpeg: 'OK', ffprobe: 'OK', h264: true });
});
