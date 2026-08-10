const VIDEO_RUNTIME_MODES = Object.freeze(["local", "disabled"]);

function resolveVideoRuntime(environment = process.env) {
    const configured = String(environment.CONTENT_ENGINE_VIDEO_MODE || "")
        .trim()
        .toLowerCase();
    const defaultMode = environment.NODE_ENV === "production"
        ? "disabled"
        : "local";
    const recognized = VIDEO_RUNTIME_MODES.includes(configured);
    const mode = recognized ? configured : defaultMode;
    const enabled = mode === "local";
    const durableLocalStorage = enabled &&
        environment.CONTENT_ENGINE_LOCAL_STORAGE_DURABLE === "true";

    let reason = null;
    if (configured && !recognized) {
        reason = "VIDEO_RUNTIME_MODE_INVALID";
    } else if (!enabled) {
        reason = "VIDEO_PROCESSING_DISABLED_FOR_THIS_DEPLOYMENT";
    } else if (environment.NODE_ENV === "production" && !durableLocalStorage) {
        reason = "LOCAL_VIDEO_STORAGE_NOT_MARKED_DURABLE";
    }

    return Object.freeze({
        mode,
        enabled,
        configured: configured || null,
        durableLocalStorage,
        storage: enabled
            ? (durableLocalStorage ? "persistent-local" : "local")
            : "none",
        reason
    });
}

function disabledVideoResponse(runtime) {
    return {
        ok: false,
        error: "VIDEO_PROCESSING_DISABLED",
        message: "El procesamiento pesado de video no está habilitado en este despliegue.",
        videoRuntime: runtime
    };
}

module.exports = {
    VIDEO_RUNTIME_MODES,
    resolveVideoRuntime,
    disabledVideoResponse
};
