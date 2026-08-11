const REQUIRED_RESOURCES = Object.freeze([
    "catalog",
    "crm",
    "trends",
    "calendar",
    "contentLibrary",
    "reviews",
    "clips",
    "workflowJobs",
    "executionLogs"
]);

function validateReadiness(payload) {
    if (!payload || payload.ok !== true) {
        throw new Error("El backend no confirmo readiness.");
    }
    if (
        payload.databaseReachable !== true ||
        payload.catalogReachable !== true ||
        payload.storageReachable !== true
    ) {
        throw new Error("Supabase, catalogo o Storage no estan disponibles.");
    }
    for (const resource of REQUIRED_RESOURCES) {
        if (payload.resources?.[resource]?.reachable !== true) {
            throw new Error(`El recurso ${resource} no esta disponible.`);
        }
    }
    if (payload.serviceRoleExposedToN8n !== false) {
        throw new Error("La service_role no debe exponerse a n8n.");
    }
    if (payload.autoPublish !== false || payload.humanApprovalRequired !== true) {
        throw new Error("Las barreras de publicacion no estan activas.");
    }
    return {
        ok: true,
        database: "reachable",
        storage: "private-and-reachable",
        resources: REQUIRED_RESOURCES.length,
        autoPublish: false,
        humanApprovalRequired: true,
        serviceRoleExposedToN8n: false
    };
}

async function fetchWithTimeout(fetchImpl, url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetchImpl(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

async function checkConnection({
    fetchImpl = globalThis.fetch,
    apiUrl = process.env.PIXELLABS_API_URL,
    token = process.env.PIXELLABS_N8N_API_TOKEN,
    attempts = 6,
    requestTimeoutMs = 60000,
    retryDelayMs = 10000
} = {}) {
    if (typeof fetchImpl !== "function") throw new Error("Node.js no incluye fetch.");
    const parsedUrl = new URL(apiUrl || "");
    if (parsedUrl.protocol !== "https:") {
        throw new Error("PIXELLABS_API_URL debe usar HTTPS.");
    }
    if (!token || token.length < 32) {
        throw new Error("PIXELLABS_N8N_API_TOKEN no esta configurado correctamente.");
    }
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            const response = await fetchWithTimeout(fetchImpl, new URL(
                "/automation/readiness",
                parsedUrl
            ), {
                headers: {
                    authorization: `Bearer ${token}`,
                    accept: "application/json",
                    "user-agent": "PixelLabs-n8n-local/1.0"
                }
            }, requestTimeoutMs);
            if (!response.ok) throw new Error(`HTTP_${response.status}`);
            const contentType = response.headers.get("content-type") || "";
            if (!contentType.includes("application/json")) {
                throw new Error("INVALID_CONTENT_TYPE");
            }
            return validateReadiness(await response.json());
        } catch (error) {
            lastError = error;
            if (attempt < attempts) {
                await new Promise(resolve => setTimeout(resolve, retryDelayMs));
            }
        }
    }
    throw new Error(`No se pudo validar la conexion: ${lastError?.message || "UNKNOWN"}`);
}

async function main() {
    const result = await checkConnection();
    console.log(JSON.stringify(result));
}

if (require.main === module) {
    main().catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    });
}

module.exports = {
    REQUIRED_RESOURCES,
    checkConnection,
    validateReadiness
};
