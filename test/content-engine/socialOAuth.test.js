const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { SocialOAuthService } = require("../../src/contentEngine/social/socialOAuthService");
const { FileSocialAccountRepository } = require("../../src/contentEngine/repositories/socialAccountRepository");
const { decryptSecret } = require("../../src/contentEngine/social/socialTokenCipher");

async function fixture(t) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pixellabs-oauth-"));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const repository = new FileSocialAccountRepository(path.join(directory, "oauth.json"));
    const env = { SOCIAL_OAUTH_ENABLED: "true", SOCIAL_TOKEN_ENCRYPTION_KEY: crypto.randomBytes(32).toString("base64"),
        META_APP_ID: "qa-app", META_APP_SECRET: "qa-meta-secret", META_GRAPH_API_VERSION: "v99.0", FACEBOOK_PAGE_ID: "qa-page",
        APP_BASE_URL: "http://127.0.0.1:3000", TIKTOK_CLIENT_KEY: "qa-client", TIKTOK_CLIENT_SECRET: "qa-secret",
        TIKTOK_REDIRECT_URI: "https://example.test/social/oauth/tiktok/callback" };
    const calls = [];
    const http = {
        post: async (url, body) => {
            calls.push({ url, body });
            return { data: { access_token: "qa-access-token", refresh_token: "qa-refresh-token", open_id: "qa-tiktok",
                scope: "user.info.basic,video.upload,video.list", expires_in: 86400, refresh_expires_in: 31536000 } };
        },
        get: async (url, options) => {
            calls.push({ url, options });
            if (url.includes("tiktok")) return { data: { data: { user: { display_name: "QA TikTok", open_id: "qa-tiktok" } }, error: { code: "ok" } } };
            if (url.includes("oauth/access_token")) return { data: { access_token: "qa-meta-user-token" } };
            if (url.endsWith("/me/permissions")) return { data: { data: ["pages_show_list", "pages_read_engagement", "pages_manage_posts",
                "instagram_basic", "instagram_content_publish"].map(permission => ({ permission, status: "granted" })) } };
            return { data: { data: [{ id: "qa-page", name: "QA Facebook", access_token: "qa-meta-page-token",
                instagram_business_account: { id: "qa-instagram", username: "QA Instagram" } }] } };
        }
    };
    return { directory, repository, env, calls, service: new SocialOAuthService({ repository, env, http }) };
}

test("Meta uses Facebook Login only and stores Page/Instagram tokens encrypted without modifying Messenger", async t => {
    const f = await fixture(t);
    const start = await f.service.start("meta");
    const url = new URL(start.url);
    assert.equal(url.hostname, "www.facebook.com");
    assert.ok(url.searchParams.get("scope").includes("instagram_content_publish"));
    assert.ok(!url.searchParams.get("scope").includes("instagram_business_content_publish"));
    const result = await f.service.complete("meta", "qa-code", url.searchParams.get("state"));
    assert.equal(result.accounts.length, 2);
    assert.equal(result.autoPublish, false);
    const raw = await fs.readFile(path.join(f.directory, "oauth.json"), "utf8");
    assert.doesNotMatch(raw, /qa-meta-page-token|qa-meta-user-token|qa-meta-secret/);
    const accounts = await f.repository.listAccounts();
    assert.ok(accounts.every(account => account.automation_enabled === false));
    const token = await f.repository.getTokens(accounts[0].id);
    assert.equal(decryptSecret({ ciphertext: token.access_ciphertext, iv: token.access_iv, tag: token.access_tag }, f.env.SOCIAL_TOKEN_ENCRYPTION_KEY), "qa-meta-page-token");
    await assert.rejects(f.service.complete("meta", "qa-code", url.searchParams.get("state")), error => error.code === "OAUTH_STATE_EXPIRED_OR_USED");
});

test("TikTok connects with video.upload, keeps direct post disabled and persists refreshed encrypted tokens", async t => {
    const f = await fixture(t);
    const start = await f.service.start("tiktok");
    const url = new URL(start.url);
    assert.ok(url.searchParams.get("scope").includes("video.upload"));
    assert.ok(!url.searchParams.get("scope").includes("video.publish"));
    const result = await f.service.complete("tiktok", "qa-code", url.searchParams.get("state"));
    assert.equal(result.accounts.length, 1);
    await f.service.refreshTikTok(result.accounts[0].id);
    const raw = await fs.readFile(path.join(f.directory, "oauth.json"), "utf8");
    assert.doesNotMatch(raw, /qa-access-token|qa-refresh-token|qa-secret/);
    assert.equal((await f.repository.listAccounts())[0].metadata.directPostAudited, false);
});

test("OAuth is disabled by default and forged or expired states cannot exchange tokens", async t => {
    const f = await fixture(t);
    const disabled = new SocialOAuthService({ env: {}, repository: f.repository });
    await assert.rejects(disabled.start("meta"), error => error.code === "SOCIAL_OAUTH_DISABLED");
    await assert.rejects(f.service.complete("tiktok", "qa-code", "forged.state"), error => error.code === "INVALID_OAUTH_STATE");
    assert.equal(f.calls.length, 0);
});
