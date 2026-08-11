const fs = require("fs");
const path = require("path");

const directory = path.resolve(__dirname, "../n8n/workflows");
const files = fs.readdirSync(directory).filter(file => file.endsWith(".json")).sort();
const errors = [];
const names = new Set();
const nodeIds = new Set();
const ALLOWED_NODE_TYPES = new Set([
    "n8n-nodes-base.manualTrigger",
    "n8n-nodes-base.scheduleTrigger",
    "n8n-nodes-base.executeWorkflowTrigger",
    "n8n-nodes-base.httpRequest",
    "n8n-nodes-base.wait"
]);

if (files.length !== 12) errors.push(`Se esperaban 12 flujos y se encontraron ${files.length}.`);

for (const file of files) {
    const workflow = JSON.parse(fs.readFileSync(path.join(directory, file), "utf8"));
    if (!workflow.name) errors.push(`${file}: falta name.`);
    if (names.has(workflow.name)) errors.push(`${file}: nombre duplicado.`);
    names.add(workflow.name);
    if (workflow.active !== false) errors.push(`${file}: active debe ser false.`);
    if (!Array.isArray(workflow.nodes) || workflow.nodes.length < 5) {
        errors.push(`${file}: debe encolar, esperar y consultar el resultado.`);
    }
    const serialized = JSON.stringify(workflow);
    if (serialized.includes('"credentials"')) errors.push(`${file}: no debe exportar credenciales.`);
    if (serialized.includes("PIXELLABS_ADMIN_API_TOKEN")) {
        errors.push(`${file}: n8n no debe recibir el token administrativo.`);
    }
    if (!serialized.includes("$env.PIXELLABS_N8N_API_TOKEN")) {
        errors.push(`${file}: debe usar el token limitado de automatización.`);
    }
    if (!serialized.includes("/automation/jobs/")) {
        errors.push(`${file}: debe usar la API limitada de automatización.`);
    }
    if (serialized.includes("SUPABASE_SERVICE_ROLE_KEY") || serialized.includes("SUPABASE_URL")) {
        errors.push(`${file}: n8n no debe recibir acceso directo privilegiado a Supabase.`);
    }
    if (!workflow.settings?.saveExecutionProgress) {
        errors.push(`${file}: debe conservar progreso de ejecución para recuperación.`);
    }
    for (const node of workflow.nodes || []) {
        if (!node.id) errors.push(`${file}: un nodo no tiene id.`);
        if (nodeIds.has(node.id)) errors.push(`${file}: id de nodo repetido entre flujos.`);
        nodeIds.add(node.id);
        if (!ALLOWED_NODE_TYPES.has(node.type)) {
            errors.push(`${file}: contiene un tipo de nodo no autorizado (${node.type}).`);
        }
        if (node.type === "n8n-nodes-base.httpRequest") {
            const url = String(node.parameters?.url || "");
            if (!url.includes("$env.PIXELLABS_API_URL")) {
                errors.push(`${file}: HTTP Request no usa PIXELLABS_API_URL.`);
            }
            if (url.includes("/admin/")) {
                errors.push(`${file}: HTTP Request no debe acceder al panel administrativo.`);
            }
            if (node.retryOnFail !== true || node.maxTries !== 3) {
                errors.push(`${file}: cada solicitud HTTP debe tener tres intentos seguros.`);
            }
            const headers = node.parameters?.headerParameters?.parameters || [];
            if (!headers.some(header => header.name === "Authorization")) {
                errors.push(`${file}: falta autenticación en una solicitud HTTP.`);
            }
            if (!headers.some(header => header.name === "X-PixelLabs-Workflow")) {
                errors.push(`${file}: falta vinculación explícita del flujo.`);
            }
            if (node.parameters?.method === "POST") {
                if (!headers.some(header => header.name === "Idempotency-Key")) {
                    errors.push(`${file}: falta Idempotency-Key en el encolado.`);
                }
                if (
                    node.parameters?.contentType !== "json" ||
                    node.parameters?.specifyBody !== "keypair" ||
                    node.parameters?.body ||
                    node.parameters?.rawContentType ||
                    node.parameters?.jsonBody
                ) {
                    errors.push(`${file}: el encolado debe usar el cuerpo JSON nativo de n8n.`);
                }
                const bodyFields = node.parameters?.bodyParameters?.parameters || [];
                if (!bodyFields.some(field => field.name === "source" && field.value === "n8n")) {
                    errors.push(`${file}: el payload debe fijar source=n8n.`);
                }
                if (!bodyFields.some(field => field.name === "payload" && String(field.value).includes("$json"))) {
                    errors.push(`${file}: el payload debe conservar los datos de entrada.`);
                }
                if (!bodyFields.some(field => field.name === "n8nExecutionId")) {
                    errors.push(`${file}: el payload no registra la ejecución de n8n.`);
                }
            }
        }
    }
    const methods = workflow.nodes
        .filter(node => node.type === "n8n-nodes-base.httpRequest")
        .map(node => node.parameters?.method || "GET");
    if (!methods.includes("POST") || !methods.includes("GET")) {
        errors.push(`${file}: debe encolar por POST y consultar estado por GET.`);
    }
    if (!workflow.nodes.some(node => node.type === "n8n-nodes-base.wait")) {
        errors.push(`${file}: falta espera no bloqueante antes de consultar el worker.`);
    }
    if (!workflow.nodes.some(node => node.type === "n8n-nodes-base.executeWorkflowTrigger")) {
        errors.push(`${file}: falta disparador interno para pruebas automatizadas.`);
    }
}

const publishFlow = JSON.parse(fs.readFileSync(
    path.join(directory, "09-schedule-publish.json"),
    "utf8"
));
if (publishFlow.active !== false) errors.push("El flujo de publicación debe permanecer desactivado.");

if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
} else {
    console.log(`n8n validado: ${files.length} flujos inactivos, con seguimiento y sin credenciales exportadas.`);
}
