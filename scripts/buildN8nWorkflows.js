const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const directory = path.resolve(__dirname, "../n8n/workflows");
const N8N_VERSION = "2.33.7";

const scheduledIdempotency = Object.freeze({
    "trend-research": "Math.floor($now.toMillis() / 86400000)",
    "schedule-publish": "Math.floor($now.toMillis() / 300000)",
    "metrics-sync": "Math.floor($now.toMillis() / 21600000)",
    "weekly-optimization": "Math.floor($now.toMillis() / 604800000)",
    "error-recovery": "Math.floor($now.toMillis() / 900000)"
});

function uuidFor(value) {
    const hex = crypto.createHash("sha256").update(value).digest("hex").slice(0, 32).split("");
    hex[12] = "4";
    hex[16] = ["8", "9", "a", "b"][parseInt(hex[16], 16) % 4];
    return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}

for (const file of fs.readdirSync(directory).filter(name => name.endsWith(".json")).sort()) {
    const filePath = path.join(directory, file);
    const workflow = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const trigger = workflow.nodes.find(node => node.type.endsWith("Trigger"));
    const enqueue = workflow.nodes.find(node => (
        node.type === "n8n-nodes-base.httpRequest" && node.parameters?.method === "POST"
    ));
    if (!trigger || !enqueue) throw new Error(`${file}: falta disparador o nodo para encolar.`);
    const workflowType = String(enqueue.parameters.url).match(/jobs\/([a-z-]+)/)?.[1];
    if (!workflowType) throw new Error(`${file}: no se pudo resolver el tipo de flujo.`);
    const idempotencySuffix = scheduledIdempotency[workflowType] || "$execution.id";

    enqueue.parameters.contentType = "json";
    enqueue.parameters.specifyBody = "keypair";
    enqueue.parameters.bodyParameters = {
        parameters: [
            { name: "source", value: "n8n" },
            { name: "requestedAt", value: "={{ $now.toISO() }}" },
            { name: "n8nExecutionId", value: "={{ $execution.id }}" },
            { name: "payload", value: "={{ $json }}" }
        ]
    };
    delete enqueue.parameters.body;
    delete enqueue.parameters.rawContentType;
    delete enqueue.parameters.jsonBody;
    enqueue.parameters.url = String(enqueue.parameters.url)
        .replace("/admin/api/content-engine/jobs/", "/automation/jobs/");
    enqueue.parameters.sendHeaders = true;
    enqueue.parameters.headerParameters = {
        parameters: [
            {
                name: "Authorization",
                value: "={{ 'Bearer ' + $env.PIXELLABS_N8N_API_TOKEN }}"
            },
            {
                name: "Idempotency-Key",
                value: `={{ '${workflowType}:' + ${idempotencySuffix} }}`
            },
            {
                name: "X-PixelLabs-Workflow",
                value: workflowType
            },
            {
                name: "X-PixelLabs-N8N-Version",
                value: N8N_VERSION
            }
        ]
    };
    enqueue.parameters.options = {
        timeout: 30000,
        response: { response: { neverError: false, responseFormat: "json" } }
    };
    enqueue.retryOnFail = true;
    enqueue.maxTries = 3;
    enqueue.waitBetweenTries = 2000;

    const waitName = "Esperar al worker";
    const statusName = "Consultar resultado";
    const testTriggerName = "Prueba interna controlada";
    const testTrigger = {
        parameters: {},
        id: uuidFor(`${file}:test-trigger`),
        name: testTriggerName,
        type: "n8n-nodes-base.executeWorkflowTrigger",
        typeVersion: 1.1,
        position: [0, 160]
    };
    const wait = {
        parameters: { amount: 5, unit: "seconds" },
        id: uuidFor(`${file}:wait`),
        name: waitName,
        type: "n8n-nodes-base.wait",
        typeVersion: 1.1,
        position: [520, 0]
    };
    const status = {
        parameters: {
            method: "GET",
            url: "={{ $env.PIXELLABS_API_URL + '/automation/jobs/status/' + $('" + enqueue.name + "').item.json.job.id }}",
            sendHeaders: true,
            headerParameters: {
                parameters: [
                    {
                        name: "Authorization",
                        value: "={{ 'Bearer ' + $env.PIXELLABS_N8N_API_TOKEN }}"
                    },
                    {
                        name: "X-PixelLabs-Workflow",
                        value: workflowType
                    }
                ]
            },
            options: {
                timeout: 30000,
                response: { response: { neverError: false, responseFormat: "json" } }
            }
        },
        id: uuidFor(`${file}:status`),
        name: statusName,
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4.2,
        position: [780, 0],
        retryOnFail: true,
        maxTries: 3,
        waitBetweenTries: 2000
    };
    workflow.nodes = workflow.nodes.filter(node => (
        ![waitName, statusName, testTriggerName].includes(node.name)
    ));
    workflow.nodes.push(testTrigger, wait, status);
    workflow.connections = {
        [trigger.name]: { main: [[{ node: enqueue.name, type: "main", index: 0 }]] },
        [testTriggerName]: { main: [[{ node: enqueue.name, type: "main", index: 0 }]] },
        [enqueue.name]: { main: [[{ node: waitName, type: "main", index: 0 }]] },
        [waitName]: { main: [[{ node: statusName, type: "main", index: 0 }]] }
    };
    workflow.settings = {
        ...(workflow.settings || {}),
        executionOrder: "v1",
        timezone: "America/El_Salvador",
        saveExecutionProgress: true,
        saveManualExecutions: true,
        executionTimeout: 300
    };
    workflow.active = false;
    fs.writeFileSync(filePath, `${JSON.stringify(workflow)}\n`);
}

console.log(`Flujos n8n ${N8N_VERSION} enriquecidos con autenticación, idempotencia y reintentos.`);
