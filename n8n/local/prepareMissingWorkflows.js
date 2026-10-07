// Import only missing names. Existing workflows, IDs, edits and credentials stay intact.
const fs = require("node:fs");
const path = require("node:path");
const { loadWorkflows, verifyImportedWorkflows, EXPECTED_NAMES } = require("./verifyImportedWorkflows");

function findMissing(existing, sources) {
    verifyImportedWorkflows(sources);
    const seen = new Set();
    for (const workflow of existing) {
        if (!EXPECTED_NAMES.includes(workflow.name) || seen.has(workflow.name)) {
            throw new Error("La instancia contiene workflows ajenos o duplicados; revisar sin borrar datos.");
        }
        if (workflow.active !== false) throw new Error("Un workflow esta activo. Detener y revisar antes de instalar.");
        seen.add(workflow.name);
    }
    return sources.filter(workflow => !seen.has(workflow.name));
}

function main(exportDirectory, sourceDirectory, outputDirectory) {
    const missing = findMissing(loadWorkflows(exportDirectory), loadWorkflows(sourceDirectory));
    fs.mkdirSync(outputDirectory, { recursive: true });
    if (fs.readdirSync(outputDirectory).length) throw new Error("La carpeta temporal de importacion no esta vacia.");
    missing.forEach((workflow, index) => fs.writeFileSync(
        path.join(outputDirectory, `${index}.json`), JSON.stringify(workflow)));
    console.log(JSON.stringify({ missing: missing.length, active: 0 }));
    return missing.length;
}
if (require.main === module) {
    try { main(...process.argv.slice(2)); }
    catch { console.error("No se pudo preparar una importacion segura de workflows."); process.exitCode = 1; }
}
module.exports = { findMissing, main };
