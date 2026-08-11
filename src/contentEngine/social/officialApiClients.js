const axios = require("axios");

function requireGraphVersion(value = process.env.META_GRAPH_API_VERSION) {
    if (!/^v\d+\.\d+$/.test(value || "")) {
        throw Object.assign(new Error("Configura una versión explícita de Meta Graph API."), {
            code: "META_GRAPH_VERSION_REQUIRED"
        });
    }
    return value;
}

function createSocialOutboundPolicy(options = {}, env = process.env) {
    return Object.freeze({
        mode: options.mode || env.SOCIAL_PUBLISH_MODE || "draft",
        externalRequestsEnabled: options.externalRequestsEnabled === true || (
            options.externalRequestsEnabled === undefined &&
            env.SOCIAL_EXTERNAL_REQUESTS_ENABLED === "true"
        ),
        allowOutbound: options.allowOutbound === true,
        approvalId: typeof options.approvalId === "string" ? options.approvalId.trim() : ""
    });
}

function assertSocialOutboundAllowed(policy, operation) {
    const allowed = policy.mode === "live" &&
        policy.externalRequestsEnabled === true &&
        policy.allowOutbound === true &&
        Boolean(policy.approvalId);
    if (!allowed) {
        throw Object.assign(
            new Error("Las llamadas a APIs sociales están bloqueadas hasta recibir aprobación humana explícita."),
            {
                statusCode: 409,
                code: "SOCIAL_OUTBOUND_DISABLED",
                operation,
                autoPublish: false
            }
        );
    }
}

class InstagramPublishingClient {
    constructor(options = {}) {
        this.http = options.http || axios;
        this.version = requireGraphVersion(options.version);
        this.accountId = options.accountId || process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
        this.accessToken = options.accessToken;
        this.outboundPolicy = createSocialOutboundPolicy(options.outboundPolicy);
    }

    headers() {
        return { Authorization: `Bearer ${this.accessToken}` };
    }

    async createContainer(input) {
        assertSocialOutboundAllowed(this.outboundPolicy, "instagram.create-container");
        const body = input.format === "reel"
            ? { media_type: "REELS", video_url: input.mediaUrl, caption: input.caption }
            : input.format === "story"
                ? { media_type: "STORIES", [input.video ? "video_url" : "image_url"]: input.mediaUrl }
                : { image_url: input.mediaUrl, caption: input.caption };
        const { data } = await this.http.post(
            `https://graph.facebook.com/${this.version}/${this.accountId}/media`,
            body,
            { headers: this.headers() }
        );
        return data;
    }

    async publishContainer(creationId) {
        assertSocialOutboundAllowed(this.outboundPolicy, "instagram.publish-container");
        const { data } = await this.http.post(
            `https://graph.facebook.com/${this.version}/${this.accountId}/media_publish`,
            { creation_id: creationId },
            { headers: this.headers() }
        );
        return data;
    }

    async getContainerStatus(creationId) {
        assertSocialOutboundAllowed(this.outboundPolicy, "instagram.get-container-status");
        const { data } = await this.http.get(
            `https://graph.facebook.com/${this.version}/${creationId}`,
            { params: { fields: "status_code,status" }, headers: this.headers() }
        );
        return data;
    }
}

class FacebookPagePublishingClient {
    constructor(options = {}) {
        this.http = options.http || axios;
        this.version = requireGraphVersion(options.version);
        this.pageId = options.pageId || process.env.FACEBOOK_PAGE_ID;
        this.accessToken = options.accessToken;
        this.outboundPolicy = createSocialOutboundPolicy(options.outboundPolicy);
    }

    headers() {
        return { Authorization: `Bearer ${this.accessToken}` };
    }

    async createFeedPost(input) {
        assertSocialOutboundAllowed(this.outboundPolicy, "facebook.create-feed-post");
        const endpoint = input.imageUrl ? "photos" : "feed";
        const body = input.imageUrl
            ? { url: input.imageUrl, caption: input.message, published: true }
            : { message: input.message, link: input.link || undefined };
        const { data } = await this.http.post(
            `https://graph.facebook.com/${this.version}/${this.pageId}/${endpoint}`,
            body,
            { headers: this.headers() }
        );
        return data;
    }

    async initializeReel() {
        assertSocialOutboundAllowed(this.outboundPolicy, "facebook.initialize-reel");
        const { data } = await this.http.post(
            `https://graph.facebook.com/${this.version}/${this.pageId}/video_reels`,
            { upload_phase: "start" },
            { headers: this.headers() }
        );
        return data;
    }

    async finishReel(videoId, description) {
        assertSocialOutboundAllowed(this.outboundPolicy, "facebook.finish-reel");
        const { data } = await this.http.post(
            `https://graph.facebook.com/${this.version}/${this.pageId}/video_reels`,
            {
                upload_phase: "finish",
                video_id: videoId,
                video_state: "PUBLISHED",
                description
            },
            { headers: this.headers() }
        );
        return data;
    }
}

class TikTokPublishingClient {
    constructor(options = {}) {
        this.http = options.http || axios;
        this.accessToken = options.accessToken;
        this.outboundPolicy = createSocialOutboundPolicy(options.outboundPolicy);
    }

    headers() {
        return {
            Authorization: `Bearer ${this.accessToken}`,
            "Content-Type": "application/json; charset=UTF-8"
        };
    }

    async queryCreatorInfo() {
        assertSocialOutboundAllowed(this.outboundPolicy, "tiktok.query-creator-info");
        const { data } = await this.http.post(
            "https://open.tiktokapis.com/v2/post/publish/creator_info/query/",
            {},
            { headers: this.headers() }
        );
        return data;
    }

    async initializeVideo(input, mode = "draft-upload") {
        assertSocialOutboundAllowed(this.outboundPolicy, `tiktok.initialize-video.${mode}`);
        const endpoint = mode === "direct-post"
            ? "https://open.tiktokapis.com/v2/post/publish/video/init/"
            : "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/";
        const body = {
            ...(mode === "direct-post" ? { post_info: input.postInfo } : {}),
            source_info: input.sourceInfo
        };
        const { data } = await this.http.post(endpoint, body, { headers: this.headers() });
        return data;
    }

    async fetchStatus(publishId) {
        assertSocialOutboundAllowed(this.outboundPolicy, "tiktok.fetch-status");
        const { data } = await this.http.post(
            "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
            { publish_id: publishId },
            { headers: this.headers() }
        );
        return data;
    }
}

module.exports = {
    InstagramPublishingClient,
    FacebookPagePublishingClient,
    TikTokPublishingClient,
    requireGraphVersion,
    createSocialOutboundPolicy,
    assertSocialOutboundAllowed
};
