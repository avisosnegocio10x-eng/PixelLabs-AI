const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { PGlite } = require("@electric-sql/pglite");

test("all migrations execute and dry-run scheduling enforces RLS, approval, limits, leases and idempotence in PostgreSQL", async t => {
    const db = new PGlite();
    t.after(() => db.close());
    // Minimal Supabase schemas/roles. gen_random_uuid is built into PostgreSQL;
    // pgcrypto extension installation is hosted by Supabase and omitted in this embedded harness.
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
        create schema auth; create table auth.users(id uuid primary key);
        create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
        create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
        create schema storage; create table storage.buckets(id text primary key, name text, public boolean, allowed_mime_types text[]);
        grant usage on schema public, auth, storage to anon, authenticated, service_role;
        alter default privileges in schema public grant all on tables to service_role;`);
    const directory = path.resolve(__dirname, "../../database/migrations");
    const files = (await fs.readdir(directory)).filter(file => file.endsWith(".sql")).sort();
    for (const file of files) {
        let sql = await fs.readFile(path.join(directory, file), "utf8");
        sql = sql.replace(/create extension if not exists pgcrypto;/i, "");
        await db.exec(sql);
    }
    const pipelineSql = await fs.readFile(path.join(directory, "20261006000920_content_pipeline.sql"), "utf8");
    await db.exec(pipelineSql); // exact rerun is safe
    const tables = await db.query("select count(*)::int as total, count(*) filter (where relrowsecurity)::int as secured from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'");
    assert.deepEqual(tables.rows[0], { total: 37, secured: 37 });
    const rls = await db.query("select relname,relrowsecurity from pg_class where relname='content_ai_usage'");
    assert.equal(rls.rows[0].relrowsecurity, true);
    const functions = await db.query("select proname,prosecdef from pg_proc where proname like 'content_%dry_run' or proname='content_reserve_ai_request'");
    assert.equal(functions.rows.length, 4);
    assert.ok(functions.rows.every(row => row.prosecdef === false));
    await db.exec("set role anon");
    await assert.rejects(db.query("select content_reserve_ai_request('anon','qa',2)"), /permission denied/);
    await db.exec("reset role; set role service_role");
    assert.equal((await db.query("select content_reserve_ai_request('one','qa',2) as allowed")).rows[0].allowed, true);
    assert.equal((await db.query("select content_reserve_ai_request('two','qa',2) as allowed")).rows[0].allowed, true);
    assert.equal((await db.query("select content_reserve_ai_request('three','qa',2) as allowed")).rows[0].allowed, false);
    const product = (await db.query("select id from products where reference='LLV-024'")).rows[0];
    const account = (await db.query(`insert into social_accounts(platform,external_account_id,display_name,metadata)
        values('facebook','dry-run:qa','QA only','{"mode":"dry-run"}') returning id`)).rows[0];
    const asset = (await db.query(`insert into media_assets(storage_bucket,storage_path,media_type,privacy_status,checksum_sha256)
        values('qa','qa.jpg','image','clear',repeat('a',64)) returning id`)).rows[0];
    const metadata = JSON.stringify({ manuallyApproved: true, approvalFingerprint: "qa-approved", mediaAssetIds: [asset.id] });
    const item = (await db.query(`insert into content_items(product_id,objective,category,format,status,approved_at,metadata)
        values($1,'qa','qa','image','DRAFT',now(),$2) returning id`, [product.id, metadata])).rows[0];
    const queue = key => db.query(`select content_queue_dry_run($1,$2,'facebook','2026-10-07T18:00:00Z',
        'page-post','QA caption','QA title','{}',$3,$4,'qa-approved',1,
        '2026-10-07T06:00:00Z','2026-10-08T06:00:00Z',900) as result`, [item.id, account.id, [asset.id], key]);
    await assert.rejects(queue("qa-key"), /CONTENT_NOT_MANUALLY_APPROVED/);
    await db.query("update content_items set status='APPROVED' where id=$1", [item.id]);
    const first = (await queue("qa-key")).rows[0].result;
    assert.equal((await queue("qa-key")).rows[0].result.id, first.id);
    await assert.rejects(queue("qa-another"), /DAILY_PUBLICATION_LIMIT/);
    const claimed = (await db.query("select content_claim_dry_run('2026-10-07T18:01:00Z') as result")).rows[0].result;
    assert.equal(claimed.id, first.id);
    assert.equal((await db.query("select content_claim_dry_run('2026-10-07T18:01:01Z') as result")).rows[0].result, null);
    await db.query("update media_assets set privacy_status='unchecked' where id=$1", [asset.id]);
    await assert.rejects(db.query("select content_finish_dry_run($1,$2,'2026-10-07T18:01:02Z')",
        [first.id, `dry-run:${first.id}`]), /VERIFIED_MEDIA_REQUIRED/);
    assert.equal((await db.query("select count(*)::int as count from publication_attempts")).rows[0].count, 0);
    await db.query("update media_assets set privacy_status='clear' where id=$1", [asset.id]);
    const output = (await db.query("select content_finish_dry_run($1,$2,'2026-10-07T18:01:02Z') as result",
        [first.id, `dry-run:${first.id}`])).rows[0].result;
    assert.equal(output.is_simulated, true);
    assert.equal(output.api_response.externalRequestsSent, 0);
    assert.equal((await db.query("select count(*)::int as count from publication_attempts")).rows[0].count, 1);
    assert.equal((await db.query("select count(*)::int as count from published_content")).rows[0].count, 1);
    await db.exec("reset role");
});
