const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const snapshotSql = `select json_build_object(
 'tables', coalesce((select json_agg(json_build_object('name',c.relname,'rls',c.relrowsecurity,
    'columns',(select json_agg(a.attname) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped)))
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'),'[]'::json),
 'indexes', coalesce((select json_agg(json_build_object('name',ci.relname,'table',ct.relname,'valid',i.indisvalid,'unique',i.indisunique))
    from pg_index i join pg_class ci on ci.oid=i.indexrelid join pg_class ct on ct.oid=i.indrelid
    join pg_namespace n on n.oid=ct.relnamespace where n.nspname='public'),'[]'::json),
 'functions', coalesce((select json_agg(json_build_object('name',p.proname,'definer',p.prosecdef,'config',p.proconfig,
    'anonExecute',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticatedExecute',has_function_privilege('authenticated',p.oid,'EXECUTE')))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'),'[]'::json),
 'policies', coalesce((select json_agg(row_to_json(p)) from pg_policies p where schemaname='public'),'[]'::json),
 'unindexedForeignKeys', coalesce((select json_agg(c.conname) from pg_constraint c join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace where n.nspname='public' and c.contype='f' and not exists
    (select 1 from pg_index i where i.indrelid=c.conrelid and i.indisvalid and i.indpred is null and
    (i.indkey::smallint[])[0:array_length(c.conkey,1)-1] @> c.conkey)),'[]'::json),
 'constraints', coalesce((select json_agg(c.conname) from pg_constraint c join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace where n.nspname='public'),'[]'::json),
 'ledgerExists', to_regclass('pixellabs_setup.schema_migrations') is not null,
 'historyExists', to_regclass('supabase_migrations.schema_migrations') is not null);`;

function migrationContracts(directory = path.resolve(__dirname, "../../database/migrations")) {
    return fs.readdirSync(directory).filter(name => name.endsWith(".sql")).sort().map(name => {
        const sql = fs.readFileSync(path.join(directory, name), "utf8");
        const tables = [];
        const columns = [];
        for (const match of sql.matchAll(/create table if not exists (?:public\.)?(\w+)\s*\(([\s\S]*?)\n\);/gi)) {
            tables.push(match[1]);
            for (const field of match[2].matchAll(/^\s{4}(\w+)\s+(\w+)/gm))
                if (!["primary", "foreign", "unique", "check", "constraint"].includes(field[1].toLowerCase()))
                    columns.push({ table: match[1], name: field[1] });
        }
        for (const alter of sql.matchAll(/alter table (?:public\.)?(\w+)([\s\S]*?);/gi))
            for (const field of alter[2].matchAll(/add column if not exists (\w+)/gi)) columns.push({ table: alter[1], name: field[1] });
        const indexes = [...sql.matchAll(/create (unique )?index if not exists (\w+)\s+on (?:public\.)?(\w+)/gi)]
            .map(match => ({ name: match[2], table: match[3], unique: Boolean(match[1]) }));
        const functions = [...sql.matchAll(/create or replace function (?:public\.)?(\w+)\(/gi)].map(match => match[1]);
        return { name, sql, hash: crypto.createHash("sha256").update(sql).digest("hex"), tables, columns, indexes, functions };
    });
}

function contractProblems(migrations, snapshot, { hardened = true } = {}) {
    const problems = [];
    const tables = new Map(snapshot.tables.map(table => [table.name, table]));
    for (const migration of migrations) {
        for (const name of migration.tables) {
            if (!tables.has(name)) problems.push(`table:${name}`);
            else if (tables.get(name).rls !== true) problems.push(`rls:${name}`);
        }
        for (const column of migration.columns) if (!tables.get(column.table)?.columns?.includes(column.name))
            problems.push(`column:${column.table}.${column.name}`);
        for (const index of migration.indexes) if (!snapshot.indexes.some(actual => actual.name === index.name &&
            actual.table === index.table && actual.valid && actual.unique === index.unique)) problems.push(`index:${index.name}`);
        for (const name of migration.functions) {
            const actual = snapshot.functions.find(func => func.name === name);
            if (!actual) problems.push(`function:${name}`);
            else if (hardened && (actual.definer || !(actual.config || []).some(value => /^search_path=(?:""|)$/.test(value))))
                problems.push(`function-security:${name}`);
            if (name.startsWith("content_") && actual && (actual.anonExecute || actual.authenticatedExecute))
                problems.push(`function-grant:${name}`);
        }
    }
    if (hardened) {
        for (const name of migrations.flatMap(migration => migration.tables).filter(name => !["social_account_tokens", "content_ai_usage"].includes(name))) {
            const policy = snapshot.policies.find(p => p.tablename === name && p.policyname === `${name}_admin_all`);
            if (!policy || !policy.roles.includes("authenticated") || !/SELECT\s+(?:public\.)?is_content_admin\(\)/i.test(policy.qual || "") ||
                !/SELECT\s+(?:public\.)?is_content_admin\(\)/i.test(policy.with_check || "")) problems.push(`policy:${name}`);
        }
        if (snapshot.unindexedForeignKeys.length) problems.push("foreign-key-indexes");
    }
    if (migrations.some(m => m.name.startsWith("20261006")) && !snapshot.constraints.includes("schedule_execution_mode_check"))
        problems.push("constraint:schedule_execution_mode_check");
    return [...new Set(problems)];
}

function planMigrations(migrations, snapshot, ledger = [], history = []) {
    for (const record of ledger) {
        const source = migrations.find(migration => migration.name === record.name);
        if (!source || source.hash !== record.sha256) throw new Error("ACTION REQUIRED: historial local de migraciones diferente; no se reaplicara SQL.");
    }
    const known = new Set(ledger.map(record => record.name));
    for (const migration of migrations) {
        const stem = migration.name.replace(/\.sql$/, "");
        if (history.some(record => String(record.version) === stem.split("_")[0] || record.name === stem ||
            record.name === stem.replace(/^\d+_/, ""))) known.add(migration.name);
    }
    const appTables = new Set(migrations.flatMap(m => m.tables));
    if (!snapshot.tables.some(table => appTables.has(table.name))) return migrations.map(m => ({ ...m, action: "pending" }));
    const legacy = migrations.slice(0, 5);
    const baseVerified = contractProblems(legacy, snapshot).length === 0;
    if (!baseVerified && legacy.some(m => !known.has(m.name))) {
        throw new Error("ACTION REQUIRED: esquema existente parcial o historial desconocido; no se reinstalara la base de datos.");
    }
    return migrations.map(migration => {
        if (known.has(migration.name)) return { ...migration, action: "registered" };
        if (legacy.includes(migration) && baseVerified) return { ...migration, action: "verified-existing" };
        if (contractProblems([migration], snapshot, { hardened: false }).length === 0) return { ...migration, action: "verified-existing" };
        const partial = migration.tables.some(table => snapshot.tables.some(actual => actual.name === table)) ||
            migration.columns.some(column => snapshot.tables.some(t => t.name === column.table && t.columns.includes(column.name))) ||
            migration.indexes.some(index => snapshot.indexes.some(actual => actual.name === index.name));
        if (partial) throw new Error("ACTION REQUIRED: una migracion sin registro esta parcialmente aplicada; revisar su historial sin borrar datos.");
        return { ...migration, action: "pending" };
    });
}

function literal(value) { return `'${String(value).replace(/'/g, "''")}'`; }
function buildMigrationSql(plan, bucket = 'pixellabs-content') {
    let sql = `begin; select pg_advisory_xact_lock(68260812);
create schema if not exists pixellabs_setup;
revoke all on schema pixellabs_setup from public, anon, authenticated;
create table if not exists pixellabs_setup.schema_migrations(name text primary key, sha256 text not null, applied_at timestamptz not null default now());
revoke all on pixellabs_setup.schema_migrations from public, anon, authenticated;\n`;
    for (const [index, migration] of plan.entries()) {
        const body = migration.sql.replace(/^\s*begin;\s*/i, "").replace(/\s*commit;\s*$/i, "");
        const delimiter = `$pixellabs_body_${index}$`;
        if (body.includes(delimiter)) throw new Error("Delimitador SQL inesperado.");
        sql += `do $pixellabs_step$ begin
if exists(select 1 from pixellabs_setup.schema_migrations where name=${literal(migration.name)} and sha256<>${literal(migration.hash)})
then raise exception 'MIGRATION_HASH_CHANGED'; end if;
if not exists(select 1 from pixellabs_setup.schema_migrations where name=${literal(migration.name)}) then
${migration.action === "pending" ? `execute ${delimiter}${body}${delimiter};` : "-- Existing schema verified; do not execute this migration again."}
insert into pixellabs_setup.schema_migrations(name,sha256) values(${literal(migration.name)},${literal(migration.hash)});
end if; end $pixellabs_step$;\n`;
    }
    // Atomic fail-closed RLS and publication checks before committing anything.
    const tables = [...new Set(plan.flatMap(m => m.tables))];
    sql += `do $pixellabs_check$ begin
if (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
and c.relkind='r' and c.relname in (${tables.map(literal).join(",")})) <> ${tables.length} then raise exception 'TABLES_REQUIRED'; end if;
if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
and c.relname in (${tables.map(literal).join(",")}) and not c.relrowsecurity) then raise exception 'RLS_REQUIRED'; end if;
if not exists(select 1 from public.content_settings where scope='global' and settings->>'autoPublish'='false'
and settings->>'approvalMode'='manual') then raise exception 'UNSAFE_PUBLICATION_SETTINGS'; end if;\n`;
    for (const column of plan.flatMap(m => m.columns)) sql += `if not exists(select 1 from information_schema.columns
where table_schema='public' and table_name=${literal(column.table)} and column_name=${literal(column.name)}) then raise exception 'COLUMN_REQUIRED'; end if;\n`;
    for (const index of plan.flatMap(m => m.indexes)) sql += `if not exists(select 1 from pg_index i join pg_class ci on ci.oid=i.indexrelid
join pg_class ct on ct.oid=i.indrelid join pg_namespace n on n.oid=ct.relnamespace where n.nspname='public'
and ci.relname=${literal(index.name)} and ct.relname=${literal(index.table)} and i.indisvalid and i.indisunique=${index.unique}) then raise exception 'INDEX_REQUIRED'; end if;\n`;
    for (const name of [...new Set(plan.flatMap(m => m.functions))]) sql += `if not exists(select 1 from pg_proc p
join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=${literal(name)} and not p.prosecdef
and 'search_path=""'=any(p.proconfig)) then raise exception 'FUNCTION_SECURITY_REQUIRED'; end if;\n`;
    sql += `if not exists(select 1 from storage.buckets where name=${literal(bucket)} and public=false)
then raise exception 'PRIVATE_STORAGE_REQUIRED'; end if;
if has_table_privilege('anon','public.social_account_tokens','SELECT') or has_table_privilege('authenticated','public.social_account_tokens','SELECT')
or has_table_privilege('anon','public.content_ai_usage','SELECT') or has_table_privilege('authenticated','public.content_ai_usage','SELECT')
then raise exception 'PRIVATE_TABLES_REQUIRED'; end if;
end $pixellabs_check$;\ncommit;\n`;
    return sql;
}

function parseDatabaseUrl(value) {
    const url = new URL(value);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || url.searchParams.get("sslmode") === "disable" ||
        !/(?:^localhost$|^127\.0\.0\.1$|\.(?:supabase\.co|supabase\.com|supabase\.in|supabase\.red)$)/i.test(url.hostname))
        throw new Error("SUPABASE_DB_URL debe usar un host oficial Supabase y TLS, o PostgreSQL local.");
    const variables = { PGHOST: url.hostname, PGPORT: url.port || "5432", PGDATABASE: decodeURIComponent(url.pathname.slice(1) || "postgres"),
        PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGCONNECT_TIMEOUT: "15",
        PGSSLMODE: ["localhost", "127.0.0.1"].includes(url.hostname) ? "prefer" : "verify-full",
        PGSSLROOTCERT: "/etc/ssl/certs/ca-certificates.crt" };
    if (!variables.PGUSER || !variables.PGPASSWORD || Object.values(variables).some(v => /[\r\n]/.test(v))) throw new Error("Conexion PostgreSQL incompleta.");
    // Docker's localhost refers to its own container; use the Desktop host bridge.
    if (["localhost", "127.0.0.1"].includes(variables.PGHOST)) variables.PGHOST = "host.docker.internal";
    return variables;
}

async function withPostgres(value, callback) {
    const variables = parseDatabaseUrl(value);
    const envPath = path.join(__dirname, "state", `postgres-${crypto.randomUUID()}.env`);
    // state/ ACL is already restricted by PowerShell before this file is created.
    fs.writeFileSync(envPath, Object.entries(variables).map(([key, val]) => `${key}=${val}`).join("\n"), { mode: 0o600, flag: "wx" });
    const execute = sql => new Promise((resolve, reject) => {
        const name = `pixellabs-db-${crypto.randomUUID()}`;
        const binary = process.platform === "win32" ? "docker.exe" : "docker";
        const child = spawn(binary, ["run", "--rm", "--name", name, "--env-file", envPath, "-i", "postgres:17-bookworm",
            "psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-f", "-"], { stdio: ["pipe", "pipe", "pipe"] });
        let output = "";
        child.stdout.on("data", chunk => { output += chunk; if (output.length > 4 * 1024 * 1024) child.kill(); });
        child.stderr.on("data", () => {}); // Never forward database/URL/password errors.
        const timer = setTimeout(() => {
            spawn(binary, ["stop", "--time", "3", name], { stdio: "ignore" }).unref();
            child.kill();
        }, 180000);
        child.stdin.on("error", () => {});
        child.once("error", () => { clearTimeout(timer); reject(new Error("POSTGRES_CLIENT_UNAVAILABLE")); });
        child.once("exit", code => { clearTimeout(timer); code === 0 ? resolve(output.trim()) : reject(new Error("POSTGRES_CHECK_FAILED")); });
        child.stdin.end(sql);
    });
    try { return await callback(execute); } finally { fs.rmSync(envPath, { force: true }); }
}

async function verifyAndMigrate(environment, execute) {
    const migrations = migrationContracts();
    let snapshot = JSON.parse(await execute(snapshotSql));
    const ledger = snapshot.ledgerExists ? JSON.parse(await execute("select coalesce(json_agg(row_to_json(h)), '[]'::json) from pixellabs_setup.schema_migrations h;")) : [];
    const history = snapshot.historyExists ? JSON.parse(await execute("select coalesce(json_agg(row_to_json(h)), '[]'::json) from supabase_migrations.schema_migrations h;")) : [];
    const plan = planMigrations(migrations, snapshot, ledger, history);
    await execute(buildMigrationSql(plan, environment.SUPABASE_STORAGE_BUCKET || 'pixellabs-content'));
    snapshot = JSON.parse(await execute(snapshotSql));
    const problems = contractProblems(migrations, snapshot);
    if (problems.length) throw new Error(`Esquema incompleto: ${problems.join(', ')}. No activar servicios externos.`);
    const bucket = environment.SUPABASE_STORAGE_BUCKET || "pixellabs-content";
    const secure = JSON.parse(await execute(`select json_build_object('bucketPrivate',exists(select 1 from storage.buckets where name=${literal(bucket)} and public=false),
        'tokenIsolation',not has_table_privilege('anon','public.social_account_tokens','SELECT') and not has_table_privilege('authenticated','public.social_account_tokens','SELECT'),
        'usageIsolation',not has_table_privilege('anon','public.content_ai_usage','SELECT') and not has_table_privilege('authenticated','public.content_ai_usage','SELECT'));`));
    if (!secure.bucketPrivate || !secure.tokenIsolation || !secure.usageIsolation) throw new Error("Storage o aislamiento de credenciales incorrecto.");
    return { pendingApplied: plan.filter(m => m.action === "pending").length, registered: plan.length,
        tables: new Set(migrations.flatMap(m => m.tables)).size, rls: "OK", indexes: "OK", storage: "OK" };
}
module.exports = { snapshotSql, migrationContracts, contractProblems, planMigrations, buildMigrationSql, parseDatabaseUrl,
    withPostgres, verifyAndMigrate };
