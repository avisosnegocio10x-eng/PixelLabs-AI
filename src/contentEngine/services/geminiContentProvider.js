const axios = require("axios");

// Verified against Google's pricing/models documentation on 2026-10-06.
// No image/video generation, grounding, paid model fallback or billing API.
const FREE_TEXT_MODELS = new Set(["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]);

function providerError(code, statusCode = 409) {
    return Object.assign(new Error(code), { code, statusCode, retryable: false });
}

class GeminiContentProvider {
    constructor(options = {}) {
        this.env = options.env || process.env;
        this.http = options.http || axios;
        this.model = this.env.CONTENT_ENGINE_GEMINI_MODEL || "gemini-3.5-flash-lite";
    }

    readiness() {
        return {
            provider: "gemini", model: this.model,
            configured: Boolean(this.env.GEMINI_API_KEY),
            freeTierConfirmed: this.env.CONTENT_ENGINE_GEMINI_FREE_TIER_CONFIRMED === "true",
            enabled: this.env.CONTENT_ENGINE_AI_ENABLED === "true",
            modelAllowed: FREE_TEXT_MODELS.has(this.model)
        };
    }

    async json(task, input, schema) {
        const readiness = this.readiness();
        if (!readiness.enabled) throw providerError("CONTENT_AI_DISABLED");
        if (!readiness.configured) throw providerError("GEMINI_KEY_REQUIRED");
        if (!readiness.freeTierConfirmed) throw providerError("GEMINI_FREE_TIER_NOT_CONFIRMED");
        if (!readiness.modelAllowed) throw providerError("GEMINI_MODEL_NOT_FREE_ALLOWLISTED");
        let data;
        try {
            ({ data } = await this.http.post(
                `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`,
                {
                    systemInstruction: { parts: [{ text: task }] },
                    contents: [{ role: "user", parts: [{ text: JSON.stringify(input) }] }],
                    generationConfig: {
                        responseMimeType: "application/json", responseJsonSchema: schema,
                        temperature: 0.4, maxOutputTokens: 4096
                    }
                },
                {
                    headers: { "x-goog-api-key": this.env.GEMINI_API_KEY },
                    timeout: 30000, maxRedirects: 0, maxContentLength: 128 * 1024
                }
            ));
        } catch (error) {
            // Axios errors may contain request headers: never propagate them to jobs/logs.
            const status = Number(error.response?.status || 0);
            throw providerError(status === 429 ? "GEMINI_FREE_QUOTA_EXHAUSTED" : "GEMINI_REQUEST_FAILED", status || 502);
        }
        const candidate = data?.candidates?.[0];
        if (candidate?.finishReason !== "STOP") throw providerError("GEMINI_INCOMPLETE_RESPONSE", 422);
        const text = candidate.content?.parts?.map(part => part.text || "").join("");
        try { return JSON.parse(text); }
        catch { throw providerError("GEMINI_INVALID_JSON", 422); }
    }
}

module.exports = { GeminiContentProvider, FREE_TEXT_MODELS, providerError };
