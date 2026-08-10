const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

test("las migraciones contienen el esquema completo y valores iniciales seguros", () => {
    const directory = path.resolve(__dirname, "../../database/migrations");
    const sql = fs.readdirSync(directory)
        .filter(file => file.endsWith(".sql"))
        .sort()
        .map(file => fs.readFileSync(path.join(directory, file), "utf8"))
        .join("\n");
    const hardening = fs.readFileSync(
        path.join(directory, "003_security_and_fk_indexes.sql"),
        "utf8"
    );
    const adminHardening = fs.readFileSync(
        path.join(directory, "005_admin_rls_hardening.sql"),
        "utf8"
    );
    const tables = [...sql.matchAll(/create table if not exists\s+([a-z_]+)/gi)]
        .map(match => match[1]);
    assert.equal(new Set(tables).size, 36);
    for (const table of [
        "content_settings", "products", "content_items", "video_clips",
        "crm_contacts", "crm_conversations", "crm_messages",
        "crm_opportunities", "workflow_jobs", "social_account_tokens"
    ]) {
        assert.ok(tables.includes(table), `Falta ${table}`);
    }
    assert.match(sql, /"autoPublish": false/);
    assert.match(sql, /"approvalMode": "manual"/);
    assert.match(sql, /'pixellabs-content'[\s\S]*?false/);
    assert.match(sql, /alter table social_account_tokens enable row level security/);
    assert.match(
        hardening,
        /create or replace function (?:public\.)?set_updated_at\(\)[\s\S]*?security invoker[\s\S]*?set search_path = ''/i
    );
    assert.match(
        adminHardening,
        /create or replace function (?:public\.)?is_content_admin\(\)[\s\S]*?security invoker[\s\S]*?set search_path = ''/i
    );
    assert.doesNotMatch(`${hardening}\n${adminHardening}`, /security definer/i);
    assert.match(
        sql,
        /revoke all on table (?:public\.)?social_account_tokens from anon, authenticated/i
    );
    assert.match(sql, /social_account_tokens_no_direct_access/i);
    assert.equal(
        (sql.match(/create index if not exists [a-z_]+ on public\.[a-z_]+ \([a-z_]+\);/gi) || []).length >= 40,
        true
    );
});
