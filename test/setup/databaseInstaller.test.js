const test = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const { snapshotSql, migrationContracts, contractProblems, planMigrations, buildMigrationSql, parseDatabaseUrl } = require('../../setup/windows/database');

async function createDatabase() {
    const db = new PGlite();
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create table auth.users(id uuid primary key);
create function auth.jwt() returns jsonb language sql as $$ select '{}'::jsonb $$;
create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
create schema storage; create table storage.buckets(id text primary key,name text,public boolean,allowed_mime_types text[]);
grant usage on schema public,auth,storage to anon,authenticated,service_role;
alter default privileges in schema public grant all on tables to service_role;`);
    return db;
}
async function snapshot(db) { return (await db.query(snapshotSql)).rows[0].json_build_object; }
function portable(plan) { return plan.map(m => ({ ...m, sql: m.sql.replace(/create extension if not exists pgcrypto;/i, '') })); }

test('installer applies all six migrations transactionally and rerun performs no SQL replay', { timeout: 60000 }, async t => {
    const db = await createDatabase(); t.after(() => db.close());
    const migrations = migrationContracts(); assert.equal(migrations.length, 6);
    let plan = planMigrations(migrations, await snapshot(db)); assert.equal(plan.filter(m => m.action === 'pending').length, 6);
    await db.exec(buildMigrationSql(portable(plan)));
    const state = await snapshot(db); assert.deepEqual(contractProblems(migrations, state), []);
    const ledger = (await db.query('select name,sha256 from pixellabs_setup.schema_migrations')).rows;
    plan = planMigrations(migrations, state, ledger);
    assert.equal(plan.filter(m => m.action === 'pending').length, 0);
    await db.exec(buildMigrationSql(plan));
    assert.equal((await db.query('select count(*)::int as n from pixellabs_setup.schema_migrations')).rows[0].n, 6);
    assert.equal((await db.query('select count(*)::int as n from products')).rows[0].n, 1);
});
test('installer adopts a fully verified legacy schema and applies only the pending pipeline', { timeout: 60000 }, async t => {
    const db = await createDatabase(); t.after(() => db.close());
    const migrations = migrationContracts();
    for (const m of portable(migrations.slice(0, 5))) await db.exec(m.sql);
    const plan = planMigrations(migrations, await snapshot(db));
    assert.deepEqual(plan.map(m => m.action), ['verified-existing','verified-existing','verified-existing','verified-existing','verified-existing','pending']);
    await db.exec(buildMigrationSql(plan));
    assert.deepEqual(contractProblems(migrations, await snapshot(db)), []);
    const changed = [{ name: migrations[0].name, sha256: 'bad-checksum' }];
    const current = await snapshot(db);
    assert.throws(() => planMigrations(migrations, current, changed), /historial/);
});
test('installer refuses partial unknown schemas and rolls back unsafe publication settings', { timeout: 60000 }, async t => {
    const db = await createDatabase(); t.after(() => db.close());
    const migrations = migrationContracts();
    await db.exec(portable(migrations)[0].sql);
    const incomplete = await snapshot(db);
    assert.throws(() => planMigrations(migrations, incomplete), /ACTION REQUIRED/);
    await db.exec("update content_settings set settings=jsonb_set(settings,'{autoPublish}','true'::jsonb)");
    const plan = migrations.map(m => ({ ...m, action: 'pending' }));
    plan[0].action = 'registered';
    await assert.rejects(db.exec(buildMigrationSql(portable(plan))), /UNSAFE_PUBLICATION_SETTINGS/);
    await db.exec('rollback');
    assert.equal((await db.query("select to_regclass('pixellabs_setup.schema_migrations') as ledger")).rows[0].ledger, null);
    assert.equal((await db.query("select to_regclass('public.content_ai_usage') as usage")).rows[0].usage, null);
});
test('PostgreSQL connection rejects untrusted hosts, disabled TLS and multiline secrets', () => {
    const config = parseDatabaseUrl('postgresql://postgres:user-password@db.example.supabase.co:5432/postgres');
    assert.equal(config.PGSSLMODE, 'verify-full'); assert.equal(config.PGPASSWORD, 'user-password');
    for (const url of ['postgresql://user:pass@unrelated.example/db', 'postgresql://user:pass@db.x.supabase.co/db?sslmode=disable',
        'postgresql://user:pass%0AOTHER=value@db.x.supabase.co/db']) assert.throws(() => parseDatabaseUrl(url));
});
