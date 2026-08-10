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
        videoRuntime
    };
}

module.exports = {
    validateRuntimeConfiguration
};
