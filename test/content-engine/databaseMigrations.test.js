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
});
