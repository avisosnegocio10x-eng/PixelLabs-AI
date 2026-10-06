const crypto = require("crypto");
const axios = require("axios");
const { requireGraphVersion } = require("./officialApiClients");
const { readKey, encryptSecret, decryptSecret } = require("./socialTokenCipher");
const { createSocialAccountRepository } = require("../repositories/socialAccountRepository");
const { scheduleError } = require("../repositories/publicationRepository");

const META_SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "instagram_basic", "instagram_content_publish"];
const TIKTOK_SCOPES = ["user.info.basic", "video.upload", "video.list"];
function validRedirect(value) {
    const url = new URL(value);
    if (url.username || url.password || url.hash || url.search ||
        !(url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) {
        throw scheduleError("INVALID_SOCIAL_REDIRECT_URI");
    }
    return url.toString();
}

class SocialOAuthService {
    constructor(options = {}) {
        this.env = options.env || process.env;
        this.repository = options.repository || createSocialAccountRepository();
        this.http = options.http || axios;
        this.now = options.now || (() => Date.now());
    }
    assertEnabled() {
        if (this.env.SOCIAL_OAUTH_ENABLED !== "true") throw scheduleError("SOCIAL_OAUTH_DISABLED");
        readKey(this.env.SOCIAL_TOKEN_ENCRYPTION_KEY);
    }
    redirect(provider) {
        return validRedirect(provider === "meta" ? this.env.META_REDIRECT_URI ||
            `${this.env.APP_BASE_URL}/social/oauth/meta/callback` : this.env.TIKTOK_REDIRECT_URI);
    }
    sign(value) { return crypto.createHmac("sha256", readKey(this.env.SOCIAL_TOKEN_ENCRYPTION_KEY)).update(value).digest("base64url"); }
    async start(provider) {
        this.assertEnabled();
        if (!["meta", "tiktok"].includes(provider)) throw scheduleError("UNKNOWN_OAUTH_PROVIDER");
        if (provider === "meta" && !(this.env.META_APP_ID && this.env.META_APP_SECRET && this.env.FACEBOOK_PAGE_ID)) throw scheduleError("META_CONNECTION_SETTINGS_REQUIRED");
        if (provider === "tiktok" && !(this.env.TIKTOK_CLIENT_KEY && this.env.TIKTOK_CLIENT_SECRET)) throw scheduleError("TIKTOK_CONNECTION_SETTINGS_REQUIRED");
        const nonce = crypto.randomBytes(24).toString("base64url");
        const expiresAt = new Date(this.now() + 10 * 60000).toISOString();
        const claims = Buffer.from(JSON.stringify({ provider, nonce, expiresAt })).toString("base64url");
        const state = `${claims}.${this.sign(claims)}`;
        const url = new URL(provider === "meta"
            ? `https://www.facebook.com/${requireGraphVersion(this.env.META_GRAPH_API_VERSION)}/dialog/oauth`
            : "https://www.tiktok.com/v2/auth/authorize/");
        url.searchParams.set(provider === "meta" ? "client_id" : "client_key", provider === "meta" ? this.env.META_APP_ID : this.env.TIKTOK_CLIENT_KEY);
        url.searchParams.set("redirect_uri", this.redirect(provider));
        url.searchParams.set("response_type", "code");
        url.searchParams.set("scope", (provider === "meta" ? META_SCOPES : TIKTOK_SCOPES).join(","));
        url.searchParams.set("state", state);
        await this.repository.createSession({ provider, nonce, expiresAt, hash: crypto.createHash("sha256").update(state).digest("hex"), consumed: false });
        return { url: url.toString(), expiresAt, provider, autoPublish: false };
    }
    async consumeState(provider, state) {
        if (typeof state !== "string" || state.length > 2000) throw scheduleError("INVALID_OAUTH_STATE");
        const [claims, signature, extra] = state.split(".");
        const expected = this.sign(claims || "");
        if (extra || !signature || signature.length !== expected.length ||
            !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw scheduleError("INVALID_OAUTH_STATE");
        let session;
        try { session = JSON.parse(Buffer.from(claims, "base64url").toString()); } catch { throw scheduleError("INVALID_OAUTH_STATE"); }
        const now = new Date(this.now()).toISOString();
        if (session.provider !== provider || session.expiresAt <= now ||
            !(await this.repository.consumeSession(session.nonce, crypto.createHash("sha256").update(state).digest("hex"), now))) {
            throw scheduleError("OAUTH_STATE_EXPIRED_OR_USED");
        }
    }
    async request(method, url, data, token) {
        try {
            const response = method === "GET" ? await this.http.get(url, {
                params: data, headers: token ? { Authorization: `Bearer ${token}` } : {}, timeout: 30000, maxRedirects: 0
            }) : await this.http.post(url, data, { timeout: 30000, maxRedirects: 0,
                headers: { "Content-Type": "application/x-www-form-urlencoded" } });
            if (response.data?.error && response.data.error.code !== "ok") throw scheduleError("SOCIAL_OAUTH_PROVIDER_ERROR");
            return response.data;
        } catch { throw scheduleError("SOCIAL_OAUTH_PROVIDER_ERROR"); }
    }
    async store(platform, externalId, name, token, permissions, metadata = {}) {
        const account = await this.repository.saveAccount({ platform, external_account_id: externalId, display_name: name,
            status: "DISCONNECTED", permissions, automation_enabled: false, metadata,
            last_verified_at: new Date(this.now()).toISOString() });
        const access = encryptSecret(token.access_token, this.env.SOCIAL_TOKEN_ENCRYPTION_KEY);
        const refresh = token.refresh_token ? encryptSecret(token.refresh_token, this.env.SOCIAL_TOKEN_ENCRYPTION_KEY) : null;
        await this.repository.saveTokens({ social_account_id: account.id, access_ciphertext: access.ciphertext,
            access_iv: access.iv, access_tag: access.tag, refresh_ciphertext: refresh?.ciphertext || null,
            refresh_iv: refresh?.iv || null, refresh_tag: refresh?.tag || null,
            access_expires_at: token.expires_in ? new Date(this.now() + Number(token.expires_in) * 1000).toISOString() : null,
            refresh_expires_at: token.refresh_expires_in ? new Date(this.now() + Number(token.refresh_expires_in) * 1000).toISOString() : null,
            scopes: permissions });
        return this.repository.saveAccount({ ...account, status: "CONNECTED" });
    }
    async complete(provider, code, state) {
        this.assertEnabled();
        if (typeof code !== "string" || !code || code.length > 4000) throw scheduleError("OAUTH_CODE_REQUIRED");
        await this.consumeState(provider, state);
        if (provider === "tiktok") {
            const token = await this.request("POST", "https://open.tiktokapis.com/v2/oauth/token/", new URLSearchParams({
                client_key: this.env.TIKTOK_CLIENT_KEY, client_secret: this.env.TIKTOK_CLIENT_SECRET,
                code, grant_type: "authorization_code", redirect_uri: this.redirect(provider)
            }).toString());
            if (!token.access_token || !token.refresh_token || !token.open_id || !token.scope?.split(",").includes("video.upload")) throw scheduleError("TIKTOK_UPLOAD_PERMISSION_REQUIRED");
            const profile = await this.request("GET", "https://open.tiktokapis.com/v2/user/info/", { fields: "open_id,display_name" }, token.access_token);
            const account = await this.store("tiktok", token.open_id, profile.data?.user?.display_name || token.open_id,
                token, token.scope.split(","), { postingMode: "draft-upload", directPostAudited: false });
            return { accounts: [{ id: account.id, platform: "tiktok", displayName: account.display_name }], autoPublish: false };
        }
        const version = requireGraphVersion(this.env.META_GRAPH_API_VERSION);
        const base = `https://graph.facebook.com/${version}`;
        const token = await this.request("GET", `${base}/oauth/access_token`, { client_id: this.env.META_APP_ID,
            client_secret: this.env.META_APP_SECRET, code, redirect_uri: this.redirect(provider) });
        if (!token.access_token) throw scheduleError("META_ACCESS_TOKEN_REQUIRED");
        const granted = await this.request("GET", `${base}/me/permissions`, {}, token.access_token);
        const permissions = (granted.data || []).filter(row => row.status === "granted").map(row => row.permission);
        if (!["pages_show_list", "pages_read_engagement", "pages_manage_posts"].every(scope => permissions.includes(scope))) throw scheduleError("META_PAGE_PERMISSIONS_REQUIRED");
        const pages = await this.request("GET", `${base}/me/accounts`, {
            fields: "id,name,access_token,instagram_business_account{id,username}", limit: 100
        }, token.access_token);
        const page = pages.data?.find(page => page.id === this.env.FACEBOOK_PAGE_ID);
        if (!page?.access_token) throw scheduleError("META_PAGE_NOT_AUTHORIZED");
        const accounts = [];
        const facebook = await this.store("facebook", page.id, page.name, { access_token: page.access_token }, permissions,
            { loginFlow: "facebook-login", graphVersion: version });
        accounts.push({ id: facebook.id, platform: "facebook", displayName: facebook.display_name });
        const ig = page.instagram_business_account;
        if (ig && (!this.env.INSTAGRAM_BUSINESS_ACCOUNT_ID || ig.id === this.env.INSTAGRAM_BUSINESS_ACCOUNT_ID) &&
            ["instagram_basic", "instagram_content_publish"].every(scope => permissions.includes(scope))) {
            const instagram = await this.store("instagram", ig.id, ig.username, { access_token: page.access_token }, permissions,
                { loginFlow: "facebook-login", pageId: page.id, graphVersion: version });
            accounts.push({ id: instagram.id, platform: "instagram", displayName: instagram.display_name });
        }
        return { accounts, autoPublish: false };
    }
    async refreshTikTok(id) {
        this.assertEnabled();
        const record = await this.repository.getTokens(id);
        if (!record?.refresh_ciphertext) throw scheduleError("TIKTOK_REAUTH_REQUIRED");
        const refreshToken = decryptSecret({ ciphertext: record.refresh_ciphertext, iv: record.refresh_iv, tag: record.refresh_tag }, this.env.SOCIAL_TOKEN_ENCRYPTION_KEY);
        const token = await this.request("POST", "https://open.tiktokapis.com/v2/oauth/token/", new URLSearchParams({
            client_key: this.env.TIKTOK_CLIENT_KEY, client_secret: this.env.TIKTOK_CLIENT_SECRET,
            grant_type: "refresh_token", refresh_token: refreshToken
        }).toString());
        const account = (await this.repository.listAccounts()).find(row => row.id === id && row.platform === "tiktok");
        if (!account || token.open_id !== account.external_account_id || !token.access_token || !token.refresh_token) throw scheduleError("TIKTOK_REFRESH_INVALID");
        await this.store("tiktok", account.external_account_id, account.display_name, token, token.scope.split(","), account.metadata);
        return { ok: true, accountId: id, autoPublish: false };
    }
}
module.exports = { SocialOAuthService, META_SCOPES, TIKTOK_SCOPES, validRedirect };
