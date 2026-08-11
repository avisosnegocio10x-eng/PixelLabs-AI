const fs = require("fs");
const path = require("path");

const EXPECTED_NAMES = Object.freeze([
    "PixelLabs 01 - Investigación diaria",
    "PixelLabs 02 - Plan editorial",
    "PixelLabs 03 - Generación de publicaciones",
    "PixelLabs 04 - Procesamiento de video",
    "PixelLabs 05 - Edición de clips",
    "PixelLabs 06 - Revisión múltiple",
    "PixelLabs 07 - Corrección",
    "PixelLabs 08 - Aprobación",
    "PixelLabs 09 - Programación y publicación",
    "PixelLabs 10 - Métricas",
    "PixelLabs 11 - Optimización semanal",
    "PixelLabs 12 - Errores"
]);

function loadWorkflows(directory) {
    return fs.readdirSync(directory)
        .filter(file => file.endsWith(".json"))
        .flatMap(file => {
            const parsed = JSON.parse(fs.readFileSync(path.join(directory, file), "utf8"));
            return Array.isArray(parsed) ? parsed : [parsed];
        });
}

function verifyImportedWorkflows(workflows) {
    const byName = new Map(workflows.map(workflow => [workflow.name, workflow]));
    if (byName.size !== workflows.length) {
        throw new Error("n8n contiene nombres de workflow duplicados.");
    }
    for (const name of EXPECTED_NAMES) {
        const workflow = byName.get(name);
        if (!workflow) throw new Error(`Falta el workflow: ${name}`);
        if (workflow.active !== false) {
            throw new Error(`El workflow debe permanecer Inactive: ${name}`);
        }
    }
    if (workflows.length !== EXPECTED_NAMES.length) {
        throw new Error(`Se esperaban 12 workflows y se encontraron ${workflows.length}.`);
    }
    return { ok: true, workflows: workflows.length, active: 0 };
}

function main(directory = process.argv[2] || "/tmp/pixellabs-workflows") {
    console.log(JSON.stringify(verifyImportedWorkflows(loadWorkflows(directory))));
}

if (require.main === module) {
    try {
        main();
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}

module.exports = {
    EXPECTED_NAMES,
    loadWorkflows,
    verifyImportedWorkflows
};
