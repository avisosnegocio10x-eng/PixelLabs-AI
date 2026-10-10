const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { parseDatabaseUrl, validatePostgresCa, postgresDockerArgs, withPostgres } = require('../../setup/windows/database');

// Public, self-signed EC fixtures; no private keys or production certificates are stored here.
const validCa = `-----BEGIN CERTIFICATE-----
MIIBUTCCAPagAwIBAgIBATAKBggqhkjOPQQDAjAlMSMwIQYDVQQDDBpQaXhlbExh
YnMgVExTIHRlc3QgZml4dHVyZTAiGA8yMDIwMDEwMTAwMDAwMFoYDzIxMjAwMTAx
MDAwMDAwWjAlMSMwIQYDVQQDDBpQaXhlbExhYnMgVExTIHRlc3QgZml4dHVyZTBZ
MBMGByqGSM49AgEGCCqGSM49AwEHA0IABOxrBTyq60GeUUC/Sva745Zr96cRTxAk
uKQznrPpr7Mk4EuogRKcBsurLHMuBZ2OcMyBX9EjUGuGb0NwAPGAkrSjEzARMA8G
A1UdEwEB/wQFMAMBAf8wCgYIKoZIzj0EAwIDSQAwRgIhAIbVSEkh6bBXjyxc6uBB
oBC80UgirABIC9IhlfS/9CXJAiEAwAZoetfnkMHrLZrJ2UoxdKSfXgSLZFFLhn7K
UjRjUJE=
-----END CERTIFICATE-----`;
const expiredCa = `-----BEGIN CERTIFICATE-----
MIIBUDCCAPagAwIBAgIBATAKBggqhkjOPQQDAjAlMSMwIQYDVQQDDBpQaXhlbExh
YnMgVExTIHRlc3QgZml4dHVyZTAiGA8yMDAwMDEwMTAwMDAwMFoYDzIwMDEwMTAx
MDAwMDAwWjAlMSMwIQYDVQQDDBpQaXhlbExhYnMgVExTIHRlc3QgZml4dHVyZTBZ
MBMGByqGSM49AgEGCCqGSM49AwEHA0IABOxrBTyq60GeUUC/Sva745Zr96cRTxAk
uKQznrPpr7Mk4EuogRKcBsurLHMuBZ2OcMyBX9EjUGuGb0NwAPGAkrSjEzARMA8G
A1UdEwEB/wQFMAMBAf8wCgYIKoZIzj0EAwIDSAAwRQIhAOyjms1xL38drV6GTHfy
QHMlU3ZbLvhedTX8G/XN7bSXAiBp9EywLJA2azaQGOsN5rZDWdN2h54HRMB++AfY
r5Dm8Q==
-----END CERTIFICATE-----`;
const futureCa = `-----BEGIN CERTIFICATE-----
MIIBUDCCAPagAwIBAgIBATAKBggqhkjOPQQDAjAlMSMwIQYDVQQDDBpQaXhlbExh
YnMgVExTIHRlc3QgZml4dHVyZTAiGA8yMTIwMDEwMTAwMDAwMFoYDzIxMzAwMTAx
MDAwMDAwWjAlMSMwIQYDVQQDDBpQaXhlbExhYnMgVExTIHRlc3QgZml4dHVyZTBZ
MBMGByqGSM49AgEGCCqGSM49AwEHA0IABOxrBTyq60GeUUC/Sva745Zr96cRTxAk
uKQznrPpr7Mk4EuogRKcBsurLHMuBZ2OcMyBX9EjUGuGb0NwAPGAkrSjEzARMA8G
A1UdEwEB/wQFMAMBAf8wCgYIKoZIzj0EAwIDSAAwRQIhAJxUWsEFbEM16o5CAYWe
+DekpJG6mCBWDjCDf43cVGUDAiBSc0ahVUy6asEArSI3aid8myT5PzA7qWrAuF67
IDa1Dw==
-----END CERTIFICATE-----`;
const leafCertificate = `-----BEGIN CERTIFICATE-----
MIIBTjCCAPOgAwIBAgIBATAKBggqhkjOPQQDAjAlMSMwIQYDVQQDDBpQaXhlbExh
YnMgVExTIHRlc3QgZml4dHVyZTAiGA8yMDIwMDEwMTAwMDAwMFoYDzIxMjAwMTAx
MDAwMDAwWjAlMSMwIQYDVQQDDBpQaXhlbExhYnMgVExTIHRlc3QgZml4dHVyZTBZ
MBMGByqGSM49AgEGCCqGSM49AwEHA0IABOxrBTyq60GeUUC/Sva745Zr96cRTxAk
uKQznrPpr7Mk4EuogRKcBsurLHMuBZ2OcMyBX9EjUGuGb0NwAPGAkrSjEDAOMAwG
A1UdEwEB/wQCMAAwCgYIKoZIzj0EAwIDSQAwRgIhAOxKaw/plIlmFTrGEEKE6RXB
q4zxvg6ul7cIBNwtl8rgAiEArAXMRi5Ub//h8y3s2mNcQ7EySPFYvwHA+lDAhGlF
Juw=
-----END CERTIFICATE-----`;
const remoteUrl = 'postgresql://postgres:fixture-password@db.fixture.supabase.co:5432/postgres';

function certificateFile(t, pem = validCa) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pixellabs-tls-'));
    t.after(() => {
        assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
        fs.rmSync(directory, { recursive: true, force: true });
    });
    const caPath = path.join(directory, 'public-ca.crt');
    fs.writeFileSync(caPath, pem);
    return caPath;
}

function fakeDocker({ output = ' 1\n', stderr = '', code = 0, error, throwOnSpawn } = {}) {
    const calls = [];
    const spawnImpl = (binary, args, options) => {
        if (throwOnSpawn) throw new Error(throwOnSpawn);
        const child = new EventEmitter();
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.stdin = new EventEmitter();
        child.kill = () => { child.killed = true; };
        child.unref = () => {};
        const call = { binary, args, options, child };
        calls.push(call);
        child.stdin.end = input => {
            call.input = input;
            setImmediate(() => {
                if (error) child.emit('error', new Error(error));
                else {
                    child.stdout.emit('data', output);
                    child.stderr.emit('data', stderr);
                    child.emit('close', code);
                }
            });
        };
        return child;
    };
    return { spawnImpl, calls };
}

test('remote TLS stays verify-full and percent-encoded credentials are decoded exactly once', () => {
    const password = 'punctuation:@%2F+ []\\?=&#"\tñ';
    const value = `postgresql://postgres:${encodeURIComponent(password)}@db.fixture.supabase.co:5432/postgres?sslmode=require&sslrootcert=untrusted&host=unrelated.example`;
    const variables = parseDatabaseUrl(value);
    assert.equal(variables.PGPASSWORD, password);
    assert.equal(variables.PGHOST, 'db.fixture.supabase.co');
    assert.equal(variables.PGSSLMODE, 'verify-full');
    assert.equal(variables.PGSSLROOTCERT, '/run/pixellabs/supabase-ca.crt');
    const args = postgresDockerArgs(variables, 'isolated-test', '/public/test-ca.crt');
    assert.ok(args.includes('-W'));
    assert.ok(!args.includes('PGPASSWORD'));
    assert.ok(!args.some(arg => arg.includes(password) || arg.includes('sslmode=require') || arg.includes('untrusted')));
});

test('malformed URLs, disabled TLS, untrusted hosts and line breaks fail with controlled errors', () => {
    for (const value of [
        'postgresql://postgres:private-url-marker@[invalid/db',
        'postgresql://postgres:private-url-marker@db.fixture.supabase.co/db?sslmode=disable',
        'postgresql://postgres:private-url-marker@db.fixture.supabase.co/db?sslmode=require&sslmode=disable',
        'postgresql://postgres:private-url-marker@unrelated.example/db',
        'postgresql://postgres:private-url-marker%0Aselect@db.fixture.supabase.co/db',
        'postgresql://postgres:private-url-marker%00@db.fixture.supabase.co/db',
        'postgresql://postgres:private-url-marker%@db.fixture.supabase.co/db'
    ]) assert.throws(() => parseDatabaseUrl(value), error => /^POSTGRES_URL_[A-Z_]+$/.test(error.message) && !error.message.includes('private-url-marker'));
});

test('missing CA is rejected before invoking Docker or the SQL callback', async t => {
    const caPath = certificateFile(t);
    fs.unlinkSync(caPath);
    const docker = fakeDocker();
    let invoked = false;
    await assert.rejects(withPostgres(remoteUrl, () => { invoked = true; }, { caPath, spawnImpl: docker.spawnImpl }), { message: 'POSTGRES_CA_MISSING' });
    assert.equal(invoked, false);
    assert.equal(docker.calls.length, 0);
});

test('malformed PEM, leaf certificates, bundles, expired and future CAs fail before Docker', async t => {
    for (const [pem, expected] of [
        ['private-invalid-marker', 'POSTGRES_CA_INVALID'],
        ['-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----', 'POSTGRES_CA_INVALID'],
        [leafCertificate, 'POSTGRES_CA_INVALID'],
        [validCa + '\n' + validCa, 'POSTGRES_CA_INVALID'],
        [expiredCa, 'POSTGRES_CA_EXPIRED'],
        [futureCa, 'POSTGRES_CA_NOT_YET_VALID']
    ]) {
        const caPath = certificateFile(t, pem);
        const docker = fakeDocker();
        await assert.rejects(withPostgres(remoteUrl, execute => execute('select 1;'), { caPath, spawnImpl: docker.spawnImpl }), { message: expected });
        assert.equal(docker.calls.length, 0);
    }
});

test('CA paths through symbolic links or Windows junctions are rejected before Docker', async t => {
    const caPath = certificateFile(t);
    const directory = path.dirname(caPath);
    const actual = path.join(directory, 'actual');
    fs.mkdirSync(actual);
    fs.renameSync(caPath, path.join(actual, 'public-ca.crt'));
    const link = path.join(directory, 'linked');
    fs.symlinkSync(actual, link, process.platform === 'win32' ? 'junction' : 'dir');
    const docker = fakeDocker();
    await assert.rejects(withPostgres(remoteUrl, execute => execute('select 1;'), { caPath: path.join(link, 'public-ca.crt'), spawnImpl: docker.spawnImpl }), { message: 'POSTGRES_CA_INVALID' });
    assert.equal(docker.calls.length, 0);
});

test('remote client binds a valid CA read-only and keeps passwords in stdin without files, env, argv or logs', async t => {
    const caPath = certificateFile(t);
    assert.equal(validatePostgresCa(caPath), path.resolve(caPath));
    const password = 'punctuation:@%2F+ []\\?=&#"\tñ';
    const value = `postgresql://postgres:${encodeURIComponent(password)}@db.fixture.supabase.co/postgres?sslmode=require`;
    const docker = fakeDocker({ stderr: `Password prompt and private diagnostics: ${password} ${caPath}` });
    const writes = t.mock.method(fs, 'writeFileSync', () => { throw new Error('Unexpected credential file'); });
    const logs = [t.mock.method(console, 'log', () => {}), t.mock.method(console, 'error', () => {})];
    const oldPassword = process.env.PGPASSWORD, oldUrl = process.env.SUPABASE_DB_URL;
    process.env.PGPASSWORD = 'inherited-private-marker';
    process.env.SUPABASE_DB_URL = value;
    try {
        assert.equal(await withPostgres(value, execute => execute('select 1;'), { caPath, spawnImpl: docker.spawnImpl }), '1');
        assert.equal(docker.calls.length, 1);
        const call = docker.calls[0];
        assert.equal(call.input, `${password}\nselect 1;`);
        assert.equal(call.options.windowsHide, true);
        assert.deepEqual(call.options.stdio, ['pipe', 'pipe', 'pipe']);
        assert.equal(call.options.env.PGSSLMODE, 'verify-full');
        assert.equal(call.options.env.PGSSLROOTCERT, '/run/pixellabs/supabase-ca.crt');
        assert.equal(call.options.env.PGPASSWORD, undefined);
        assert.equal(call.options.env.SUPABASE_DB_URL, undefined);
        assert.ok(!JSON.stringify(call.options.env).includes(password));
        assert.ok(!JSON.stringify(call.args).includes(password));
        assert.ok(!call.args.includes('--env-file'));
        assert.ok(call.args.includes('--rm'));
        assert.equal(call.args[call.args.indexOf('--log-driver') + 1], 'none');
        assert.equal(call.args[call.args.indexOf('--mount') + 1], `type=bind,source=${path.resolve(caPath)},target=/run/pixellabs/supabase-ca.crt,readonly`);
        assert.deepEqual(call.args.slice(call.args.indexOf('psql')), ['psql', '-X', '-q', '-A', '-t', '-W', '-v', 'ON_ERROR_STOP=1', '-f', '-']);
        assert.equal(writes.mock.callCount(), 0);
        for (const logger of logs) assert.equal(logger.mock.callCount(), 0);
    } finally {
        if (oldPassword === undefined) delete process.env.PGPASSWORD; else process.env.PGPASSWORD = oldPassword;
        if (oldUrl === undefined) delete process.env.SUPABASE_DB_URL; else process.env.SUPABASE_DB_URL = oldUrl;
    }
});

test('localhost remains compatible without a remote CA or secret env file', async () => {
    const docker = fakeDocker();
    const value = 'postgresql://postgres:local-fixture@localhost/postgres';
    assert.equal(await withPostgres(value, execute => execute('select 1;'), { caPath: '/does-not-exist', spawnImpl: docker.spawnImpl }), '1');
    const call = docker.calls[0];
    assert.equal(call.options.env.PGHOST, 'host.docker.internal');
    assert.equal(call.options.env.PGSSLMODE, 'prefer');
    assert.equal(call.options.env.PGSSLROOTCERT, undefined);
    assert.ok(!call.args.includes('--mount'));
    assert.equal(call.options.env.PGPASSWORD, undefined);
});

test('Docker launch and database failures return controlled messages without private diagnostics', async t => {
    const caPath = certificateFile(t);
    for (const [behavior, expected] of [
        [{ throwOnSpawn: `fixture-password ${caPath}` }, 'POSTGRES_CLIENT_UNAVAILABLE'],
        [{ error: `fixture-password ${caPath}` }, 'POSTGRES_CLIENT_UNAVAILABLE'],
        [{ code: 1, stderr: `fixture-password ${caPath}`, output: 'private response' }, 'POSTGRES_CHECK_FAILED']
    ]) {
        const docker = fakeDocker(behavior);
        await assert.rejects(withPostgres(remoteUrl, execute => execute('select 1;'), { caPath, spawnImpl: docker.spawnImpl }), { message: expected });
    }
});
