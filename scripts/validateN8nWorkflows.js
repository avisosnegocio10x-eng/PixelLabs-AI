const fs = require("fs");
const path = require("path");

const directory = path.resolve(__dirname, "../n8n/workflows");
const files = fs.readdirSync(directory).filter(file => file.endsWith(".json")).sort();
const errors = [];
const names = new Set();
const nodeIds = new Set();

if (files.length !== 12) errors.push(`Se esperaban 12 flujos y se encontraron ${files.length}.`);

for (const file of files) {
    const workflow = JSON.parse(fs.readFileSync(path.join(directory, file), "utf8"));
    if (!workflow.name) errors.push(`${file}: falta name.`);
    if (names.has(workflow.name)) errors.push(`${file}: nombre duplicado.`);
    names.add(workflow.name);
    if (workflow.active !== false) errors.push(`${file}: active debe ser false.`);
    if (!Array.isArray(workflow.nodes) || workflow.nodes.length < 2) {
        errors.push(`${file}: debe contener disparador y acción.`);
    }
    const serialized = JSON.stringify(workflow);
    if (serialized.includes('"credentials"')) errors.push(`${file}: no debe exportar credenciales.`);
    if (serialized.includes("PIXELLABS_ADMIN_API_TOKEN") && !serialized.includes("$env.PIXELLABS_ADMIN_API_TOKEN")) {
        errors.push(`${file}: el token debe leerse desde variables de entorno.`);
    }
    for (const node of workflow.nodes || []) {
        if (!node.id) errors.push(`${file}: un nodo no tiene id.`);
        if (nodeIds.has(node.id)) errors.push(`${file}: id de nodo repetido entre flujos.`);
        nodeIds.add(node.id);
        if (node.type === "n8n-nodes-base.httpRequest") {
            const url = String(node.parameters?.url || "");
            if (!url.includes("$env.PIXELLABS_API_URL")) {
                errors.push(`${file}: HTTP Request no usa PIXELLABS_API_URL.`);
            }
        }
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
    console.log(`n8n validado: ${files.length} flujos inactivos, sin credenciales exportadas.`);
}
