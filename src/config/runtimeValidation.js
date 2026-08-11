const {
    hasSupabaseConfiguration
} = require("../contentEngine/db/supabaseClient");
const {
    resolveVideoRuntime
} = require("../contentEngine/video/videoRuntimePolicy");

function validateRuntimeConfiguration(environment = process.env) {
    const errors = [];
    const requiresSupabase = environment.REQUIRE_SUPABASE === "true";
    const videoRuntime = resolveVideoRuntime(environment);

    if (requiresSupabase && !hasSupabaseConfiguration(environment)) {
        errors.push("SUPABASE_REQUIRED_BUT_NOT_CONFIGURED");
    }
    if (environment.CONTENT_ENGINE_AUTO_PUBLISH === "true") {
        errors.push("AUTO_PUBLISH_MUST_REMAIN_DISABLED");
    }
    if (environment.SOCIAL_PUBLISH_MODE && environment.SOCIAL_PUBLISH_MODE !== "draft") {
        errors.push("SOCIAL_PUBLISH_MODE_MUST_BE_DRAFT");
    }
    if (environment.SOCIAL_EXTERNAL_REQUESTS_ENABLED === "true") {
        errors.push("SOCIAL_EXTERNAL_REQUESTS_MUST_REMAIN_DISABLED");
    }
    if (
        environment.NODE_ENV === "production" &&
        environment.N8N_WEBHOOK_SECRET &&
        environment.N8N_WEBHOOK_SECRET.length < 32
    ) {
        errors.push("N8N_WEBHOOK_SECRET_TOO_SHORT");
    }
    const privilegedTokens = [
        environment.ADMIN_API_TOKEN,
        environment.N8N_WEBHOOK_SECRET,
        environment.LOCAL_WORKER_API_TOKEN
    ].filter(Boolean);
    if (new Set(privilegedTokens).size !== privilegedTokens.length) {
        errors.push("PRIVILEGED_TOKENS_MUST_BE_DISTINCT");
    }
    if (
        environment.NODE_ENV === "production" &&
        videoRuntime.enabled &&
        !videoRuntime.durableLocalStorage
    ) {
        errors.push("PRODUCTION_VIDEO_REQUIRES_DURABLE_LOCAL_STORAGE");
    }

    if (errors.length) {
        throw Object.assign(new Error(`Configuración insegura: ${errors.join(", ")}`), {
            code: "UNSAFE_RUNTIME_CONFIGURATION",
            errors
        });
    }

    return {
        requiresSupabase,
        supabaseConfigured: hasSupabaseConfiguration(environment),
        autoPublish: false,
        socialPublishMode: environment.SOCIAL_PUBLISH_MODE || "draft",
        socialExternalRequestsEnabled: false,
        videoRuntime
    };
}

module.exports = {
    validateRuntimeConfiguration
};
