const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { assertSupported, socialReadiness } = require("../../src/contentEngine/social/capabilities");
const { encryptSecret, decryptSecret } = require("../../src/contentEngine/social/socialTokenCipher");
const { createPlatformVariant } = require("../../src/contentEngine/social/platformVariantService");
const {
    InstagramPublishingClient,
    TikTokPublishingClient
} = require("../../src/contentEngine/social/officialApiClients");

test("solo declara formatos admitidos por cada integración oficial", () => {
    assert.equal(assertSupported("instagram", "reel").accountType, "Instagram professional account");
    assert.throws(() => assertSupported("facebook", "marketplace-listing"), error => (
        error.code === "UNSUPPORTED_SOCIAL_FORMAT"
    ));
});

test("cifra tokens OAuth con AES-256-GCM y detecta alteraciones", () => {
    const key = crypto.randomBytes(32).toString("base64");
    const encrypted = encryptSecret("token-test-only", key);
    assert.equal(decryptSecret(encrypted, key), "token-test-only");
    assert.throws(() => decryptSecret({ ...encrypted, tag: Buffer.alloc(16).toString("base64") }, key));
});

test("adapta el texto por plataforma y mantiene todo como borrador", () => {
    const item = {
        format: "reel",
        title: "Tu nombre en 3D",
        primaryText: "Mira cómo fabricamos tu llavero.",
        callToAction: "Escríbenos para cotizar.",
        hashtags: ["PixelLabs", "Impresión3D"]
    };
    const product = {
        reference: "LLV-024",
        name: "Llavero personalizado",
        availabilityStatus: "AVAILABLE"
    };
    const instagram = createPlatformVariant(item, product, "instagram");
    const facebook = createPlatformVariant(item, product, "facebook");
    assert.notEqual(instagram.caption, facebook.caption);
    assert.equal(instagram.status, "DRAFT");
    assert.equal(instagram.autoPublish, false);
});

test("readiness nunca activa publicación automática", () => {
    const readiness = socialReadiness({
        SOCIAL_PUBLISH_MODE: "draft",
        META_APP_ID: "configured",
        META_APP_SECRET: "configured",
        FACEBOOK_PAGE_ID: "configured"
    });
    assert.equal(readiness.facebook.configured, true);
    assert.equal(readiness.facebook.liveEnabled, false);
    assert.equal(readiness.autoPublish, false);
});

test("los clientes oficiales envían tokens solo en Authorization", async () => {
    const calls = [];
    const http = {
        post: async (url, body, options) => {
            calls.push({ url, body, options });
            return { data: { id: "external-test-id" } };
        }
    };
    const instagram = new InstagramPublishingClient({
        http,
        version: "v99.0",
        accountId: "ig-test",
        accessToken: "test-only-token"
    });
    await instagram.createContainer({
        format: "reel",
        mediaUrl: "https://example.com/video.mp4",
        caption: "Prueba"
    });
    const tiktok = new TikTokPublishingClient({ http, accessToken: "test-only-token" });
    await tiktok.fetchStatus("publish-test-id");
    assert.equal(calls.every(call => !call.url.includes("test-only-token")), true);
    assert.equal(calls.every(call => call.options.headers.Authorization === "Bearer test-only-token"), true);
});
