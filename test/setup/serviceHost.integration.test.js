const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const dotenv = require('dotenv');
const { makeSandbox } = require('../../setup/windows/qa');
const { SAFE_FLAGS, SECRET_NAMES } = require('../../setup/windows/safety');

test('local service host starts backend on loopback, keeps OAuth blocked, pauses worker and stops only its services', { timeout: 30000 }, async t => {
    const sandbox = await makeSandbox();
    const children = [];
    t.after(async () => {
        for (const child of children) if (child.exitCode === null) child.kill();
        await fs.rm(sandbox, { recursive: true, force: true });
    });
    const portServer = net.createServer().listen(0, '127.0.0.1'); await once(portServer, 'listening');
    const port = portServer.address().port; await new Promise(resolve => portServer.close(resolve));
    const environment = { ...dotenv.parse(await fs.readFile(path.join(sandbox, '.env.example'))), ...SAFE_FLAGS,
        ...Object.fromEntries(SECRET_NAMES.map(name => [name, crypto.randomBytes(32).toString('base64')])),
        NODE_ENV: 'development', PORT: String(port), APP_BASE_URL: `http://127.0.0.1:${port}` };
    const state = path.join(sandbox, 'setup/windows/state'); await fs.mkdir(state, { recursive: true });
    await fs.mkdir(path.join(sandbox, 'local-worker/inbox'), { recursive: true });
    await fs.writeFile(path.join(sandbox, 'local-worker/inbox', 'existing.mp4'), 'video remains untouched while paused');
    await fs.writeFile(path.join(sandbox, 'setup/windows/local.env'), Object.entries(environment).map(([key,val]) => `${key}=${val}`).join('\n'), {mode:0o600});
    await fs.writeFile(path.join(sandbox, 'setup/windows/worker.env'), `LOCAL_WORKER_MODE=offline\nLOCAL_WORKER_API_URL=${environment.APP_BASE_URL}\nLOCAL_WORKER_API_TOKEN=${environment.LOCAL_WORKER_API_TOKEN}\n`, {mode:0o600});
    async function start(service, paused) {
        const instance = crypto.randomUUID();
        const child = spawn(process.execPath, [path.join(sandbox, 'setup/windows/service-host.js'), service, instance, ...(paused?['--paused']:[])], {
            cwd:sandbox, env:{...process.env,...environment,PIXELLABS_CONTAINER_BACKEND:'false'}, stdio:'ignore'
        });
        children.push(child);
        for (let i=0;i<100;i++) {
            if (child.exitCode !== null) throw new Error('SERVICE_START_FAILED');
            try {
                const health=JSON.parse(await fs.readFile(path.join(state, `${service}-health.json`)));
                if (health.instance===instance && health.status==='ready') return {child,instance,health};
            } catch {}
            await new Promise(resolve=>setTimeout(resolve,50));
        }
        throw new Error('SERVICE_HEALTH_TIMEOUT');
    }
    const backend=await start('backend',false);
    const health=await fetch(`${environment.APP_BASE_URL}/healthz`).then(r=>r.json()); assert.equal(health.autoPublish,false);
    assert.equal((await fetch(`${environment.APP_BASE_URL}/admin/api/content-engine/settings`)).status,401);
    const oauth=await fetch(`${environment.APP_BASE_URL}/social/oauth/meta/callback?code=test&state=test`).then(r=>r.json());
    assert.equal(oauth.error,'SOCIAL_OAUTH_DISABLED');
    const worker=await start('worker',true); assert.equal(worker.health.paused,true);
    assert.equal(await fs.readFile(path.join(sandbox,'local-worker/inbox/existing.mp4'),'utf8'),'video remains untouched while paused');
    for (const service of [worker,backend]) {
        const exited=once(service.child,'exit'); await fs.writeFile(path.join(state,`stop-${service.instance}`),'stop');
        const [code]=await exited; assert.equal(code,0);
    }
});
