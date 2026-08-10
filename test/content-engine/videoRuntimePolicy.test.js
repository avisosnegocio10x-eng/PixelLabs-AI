const test = require("node:test");
const assert = require("node:assert/strict");
const {
    resolveVideoRuntime
} = require("../../src/contentEngine/video/videoRuntimePolicy");
const {
    validateRuntimeConfiguration
} = require("../../src/config/runtimeValidation");

test("producción desactiva video si no existe una decisión explícita", () => {
    const runtime = resolveVideoRuntime({ NODE_ENV: "production" });
    assert.equal(runtime.mode, "disabled");
    assert.equal(runtime.enabled, false);
});

test("video local en producción exige almacenamiento marcado como durable", () => {
    assert.throws(() => validateRuntimeConfiguration({
        NODE_ENV: "production",
        CONTENT_ENGINE_VIDEO_MODE: "local",
        CONTENT_ENGINE_LOCAL_STORAGE_DURABLE: "false",
        CONTENT_ENGINE_AUTO_PUBLISH: "false",
        SOCIAL_PUBLISH_MODE: "draft"
    }), error => (
        error.code === "UNSAFE_RUNTIME_CONFIGURATION" &&
        error.errors.includes("PRODUCTION_VIDEO_REQUIRES_DURABLE_LOCAL_STORAGE")
    ));

    const valid = validateRuntimeConfiguration({
        NODE_ENV: "production",
        CONTENT_ENGINE_VIDEO_MODE: "local",
        CONTENT_ENGINE_LOCAL_STORAGE_DURABLE: "true",
        CONTENT_ENGINE_AUTO_PUBLISH: "false",
        SOCIAL_PUBLISH_MODE: "draft"
    });
    assert.equal(valid.videoRuntime.storage, "persistent-local");
});

test("el perfil persistente rechaza Supabase ausente y publicación real", () => {
    assert.throws(() => validateRuntimeConfiguration({
        NODE_ENV: "production",
        REQUIRE_SUPABASE: "true",
        CONTENT_ENGINE_VIDEO_MODE: "disabled",
        CONTENT_ENGINE_AUTO_PUBLISH: "true",
        SOCIAL_PUBLISH_MODE: "live"
    }), error => (
        error.errors.includes("SUPABASE_REQUIRED_BUT_NOT_CONFIGURED") &&
        error.errors.includes("AUTO_PUBLISH_MUST_REMAIN_DISABLED") &&
        error.errors.includes("SOCIAL_PUBLISH_MODE_MUST_BE_DRAFT")
    ));
});

test("el perfil gratuito acepta Supabase y mantiene video pesado apagado", () => {
    const valid = validateRuntimeConfiguration({
        NODE_ENV: "production",
        REQUIRE_SUPABASE: "true",
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "test-only-not-a-real-key",
        CONTENT_ENGINE_VIDEO_MODE: "disabled",
        CONTENT_ENGINE_LOCAL_STORAGE_DURABLE: "false",
        CONTENT_ENGINE_AUTO_PUBLISH: "false",
        SOCIAL_PUBLISH_MODE: "draft"
    });
    assert.equal(valid.supabaseConfigured, true);
    assert.equal(valid.videoRuntime.enabled, false);
    assert.equal(valid.autoPublish, false);
});
