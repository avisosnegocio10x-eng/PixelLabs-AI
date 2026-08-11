const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function payloadError(message, code = "INVALID_AUTOMATION_PAYLOAD") {
    return Object.assign(new Error(message), {
        statusCode: 422,
        code
    });
}

function inspectValue(value, state, depth = 0) {
    if (depth > 8) throw payloadError("El payload excede la profundidad permitida.");
    if (value === null || ["boolean", "number"].includes(typeof value)) return;
    if (typeof value === "string") {
        if (value.length > 20_000) throw payloadError("El payload contiene texto demasiado largo.");
        state.strings += value.length;
        if (state.strings > 200_000) throw payloadError("El payload contiene demasiado texto.");
        return;
    }
    if (Array.isArray(value)) {
        if (value.length > 500) throw payloadError("El payload contiene demasiados elementos.");
        for (const item of value) inspectValue(item, state, depth + 1);
        return;
    }
    if (typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) {
        throw payloadError("El payload debe contener solamente datos JSON.");
    }
    const keys = Object.keys(value);
    if (keys.length > 100) throw payloadError("El payload contiene demasiados campos.");
    for (const key of keys) {
        if (FORBIDDEN_KEYS.has(key)) throw payloadError("El payload contiene un campo prohibido.");
        inspectValue(value[key], state, depth + 1);
    }
}

function validateWorkflowPayload(payload, options = {}) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw payloadError("El payload del flujo debe ser un objeto JSON.");
    }
    const bytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
    if (bytes > 256 * 1024) throw payloadError("El payload supera 256 KiB.");
    inspectValue(payload, { strings: 0 });
    if (options.requireN8nSource && payload.source !== "n8n") {
        throw payloadError("El origen del flujo no es válido.", "INVALID_AUTOMATION_SOURCE");
    }
    return payload;
}

function validateIdempotencyKey(value, required = false) {
    const key = String(value || "").trim();
    if (!key && required) {
        throw payloadError(
            "Idempotency-Key es obligatorio para n8n.",
            "IDEMPOTENCY_KEY_REQUIRED"
        );
    }
    if (key && (!/^[A-Za-z0-9:_\-.]{8,200}$/.test(key))) {
        throw payloadError(
            "Idempotency-Key tiene un formato inválido.",
            "INVALID_IDEMPOTENCY_KEY"
        );
    }
    return key;
}

function normalizeAutomationPayload(envelope) {
    if (!Object.prototype.hasOwnProperty.call(envelope, "payload")) return envelope;
    const payload = envelope.payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw payloadError("payload debe ser un objeto JSON.");
    }
    return {
        ...payload,
        source: envelope.source,
        requestedAt: envelope.requestedAt,
        n8nExecutionId: envelope.n8nExecutionId
    };
}

module.exports = {
    validateWorkflowPayload,
    validateIdempotencyKey,
    normalizeAutomationPayload,
    payloadError
};
