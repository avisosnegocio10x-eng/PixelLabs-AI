const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("los doce workflows quedan inactivos, idempotentes y aislados de Supabase", () => {
    const directory = path.resolve(__dirname, "../../n8n/workflows");
    const files = fs.readdirSync(directory).filter(file => file.endsWith(".json")).sort();
    assert.equal(files.length, 12);
    for (const file of files) {
        const workflow = JSON.parse(fs.readFileSync(path.join(directory, file), "utf8"));
        assert.equal(workflow.active, false, file);
        const serialized = JSON.stringify(workflow);
        assert.doesNotMatch(serialized, /SUPABASE_SERVICE_ROLE_KEY|ADMIN_API_TOKEN/, file);
        assert.match(serialized, /Idempotency-Key/, file);
        assert.match(serialized, /X-PixelLabs-Workflow/, file);
        const requests = workflow.nodes.filter(node => node.type === "n8n-nodes-base.httpRequest");
        assert.equal(requests.length, 2, file);
        assert.ok(requests.every(node => node.retryOnFail && node.maxTries === 3), file);
        assert.ok(workflow.nodes.some(node => (
            node.type === "n8n-nodes-base.executeWorkflowTrigger"
        )), file);
    }
});
