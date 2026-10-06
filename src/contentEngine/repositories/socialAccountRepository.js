const crypto = require("crypto");
const path = require("path");
const { JsonDocumentStore } = require("./jsonDocumentStore");
const { getSupabaseAdminClient, hasSupabaseConfiguration } = require("../db/supabaseClient");
const { scheduleError } = require("./publicationRepository");

class FileSocialAccountRepository {
    constructor(filePath = path.resolve(process.env.CONTENT_ENGINE_WORK_DIR || "./storage/work", "social-connections.json")) {
        this.store = new JsonDocumentStore(filePath, { accounts: [], tokens: [], sessions: [] });
    }
    async createSession(session) { await this.store.update(doc => { doc.sessions.push(session); }); }
    async consumeSession(nonce, hash, now) {
        let accepted = false;
        await this.store.update(doc => {
            const session = doc.sessions.find(row => row.nonce === nonce && row.hash === hash && !row.consumed && row.expiresAt > now);
            if (session) { session.consumed = true; accepted = true; }
        });
        return accepted;
    }
    async saveAccount(input) {
        let account;
        await this.store.update(doc => {
            account = doc.accounts.find(row => row.platform === input.platform && row.external_account_id === input.external_account_id);
            if (!account) { account = { id: crypto.randomUUID(), ...input }; doc.accounts.push(account); }
            else Object.assign(account, input);
        });
        return account;
    }
    async saveTokens(input) {
        await this.store.update(doc => {
            const existing = doc.tokens.find(row => row.social_account_id === input.social_account_id);
            if (existing) Object.assign(existing, input); else doc.tokens.push(input);
        });
    }
    async getTokens(id) { return (await this.store.read()).tokens.find(row => row.social_account_id === id); }
    async listAccounts() { return (await this.store.read()).accounts; }
}

class SupabaseSocialAccountRepository {
    constructor(client = getSupabaseAdminClient()) { this.client = client; }
    async createSession(session) {
        const { error } = await this.client.from("social_accounts").insert({
            platform: session.provider === "meta" ? "facebook" : "tiktok", external_account_id: `oauth:${session.nonce}`,
            display_name: "Autorización pendiente", status: "DISCONNECTED", automation_enabled: false,
            metadata: { oauthStateHash: session.hash, oauthExpiresAt: session.expiresAt, consumed: false }
        });
        if (error) throw scheduleError("OAUTH_SESSION_STORE_FAILED");
    }
    async consumeSession(nonce, hash, now) {
        const { data, error } = await this.client.from("social_accounts")
            .update({ metadata: { consumed: true } }).eq("external_account_id", `oauth:${nonce}`)
            .contains("metadata", { oauthStateHash: hash, consumed: false })
            .gt("metadata->>oauthExpiresAt", now).select("id");
        if (error) throw scheduleError("OAUTH_SESSION_LOOKUP_FAILED");
        return data?.length === 1;
    }
    async saveAccount(input) {
        const { data, error } = await this.client.from("social_accounts").upsert(input,
            { onConflict: "platform,external_account_id" }).select("*").single();
        if (error) throw scheduleError("SOCIAL_ACCOUNT_SAVE_FAILED");
        return data;
    }
    async saveTokens(input) {
        const { error } = await this.client.from("social_account_tokens").upsert(input, { onConflict: "social_account_id" });
        if (error) throw scheduleError("SOCIAL_TOKEN_STORE_FAILED");
    }
    async getTokens(id) {
        const { data, error } = await this.client.from("social_account_tokens").select("*").eq("social_account_id", id).maybeSingle();
        if (error) throw scheduleError("SOCIAL_TOKEN_LOOKUP_FAILED");
        return data;
    }
    async listAccounts() {
        const { data, error } = await this.client.from("social_accounts")
            .select("id,platform,external_account_id,display_name,status,permissions,last_verified_at,metadata")
            .not("external_account_id", "like", "oauth:%").not("external_account_id", "like", "dry-run:%");
        if (error) throw scheduleError("SOCIAL_ACCOUNTS_UNAVAILABLE");
        return data || [];
    }
}
function createSocialAccountRepository() {
    return hasSupabaseConfiguration() ? new SupabaseSocialAccountRepository() : new FileSocialAccountRepository();
}
module.exports = { FileSocialAccountRepository, SupabaseSocialAccountRepository, createSocialAccountRepository };
