const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const directory = path.resolve(__dirname, "../n8n/workflows");

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

    enqueue.parameters.body = "={{ JSON.stringify({ ...$json, source: 'n8n', requestedAt: $now.toISO() }) }}";
    enqueue.parameters.url = String(enqueue.parameters.url)
        .replace("/admin/api/content-engine/jobs/", "/automation/jobs/");
    enqueue.parameters.sendHeaders = true;
    enqueue.parameters.headerParameters = {
        parameters: [{
            name: "Authorization",
            value: "={{ 'Bearer ' + $env.PIXELLABS_N8N_API_TOKEN }}"
        }]
    };
    enqueue.parameters.options = {
        timeout: 30000,
        response: { response: { neverError: false, responseFormat: "json" } }
    };

    const waitName = "Esperar al worker";
    const statusName = "Consultar resultado";
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
                parameters: [{
                    name: "Authorization",
                    value: "={{ 'Bearer ' + $env.PIXELLABS_N8N_API_TOKEN }}"
                }]
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
        position: [780, 0]
    };
    workflow.nodes = workflow.nodes.filter(node => ![waitName, statusName].includes(node.name));
    workflow.nodes.push(wait, status);
    workflow.connections = {
        [trigger.name]: { main: [[{ node: enqueue.name, type: "main", index: 0 }]] },
        [enqueue.name]: { main: [[{ node: waitName, type: "main", index: 0 }]] },
        [waitName]: { main: [[{ node: statusName, type: "main", index: 0 }]] }
    };
    workflow.active = false;
    fs.writeFileSync(filePath, `${JSON.stringify(workflow)}\n`);
}

console.log("Flujos n8n enriquecidos con payload, espera y consulta de estado.");
