const axios = require("axios");

function safeSocialHttp(http) {
    return Object.fromEntries(["get", "post", "put"].map(method => [method, async (...args) => {
        try {
            const index = method === "get" ? 1 : 2;
            args[index] = { ...args[index], timeout: 30000, maxRedirects: 0 };
            const response = await http[method](...args);
            if (response.data?.error && response.data.error.code !== "ok") throw new Error("provider error");
            return response;
        } catch (error) {
            throw Object.assign(new Error("La API social no pudo completar la solicitud."), {
                code: "SOCIAL_PROVIDER_REQUEST_FAILED", statusCode: Number(error.response?.status || 502), retryable: false
            });
        }
    }]));
}

function requireHttps(value, hostname) {
    let url;
    try { url = new URL(value); } catch { throw Object.assign(new Error("MEDIA_URL_INVALID"), { code: "MEDIA_URL_INVALID", statusCode: 422 }); }
    if (url.protocol !== "https:" || url.username || url.password || (hostname && url.hostname !== hostname)) {
        throw Object.assign(new Error("MEDIA_URL_INVALID"), { code: "MEDIA_URL_INVALID", statusCode: 422 });
    }
    return url;
}

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
        this.http = safeSocialHttp(options.http || axios);
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

    async createCarousel(input) {
        assertSocialOutboundAllowed(this.outboundPolicy, "instagram.create-carousel");
        if (!Array.isArray(input.items) || input.items.length < 2 || input.items.length > 10) {
            throw Object.assign(new Error("CAROUSEL_REQUIRES_2_TO_10_ITEMS"), { code: "INVALID_CAROUSEL", statusCode: 422 });
        }
        const children = [];
        for (const item of input.items) {
            requireHttps(item.mediaUrl);
            const body = { is_carousel_item: true, ...(item.video
                ? { media_type: "VIDEO", video_url: item.mediaUrl } : { image_url: item.mediaUrl }) };
            const { data } = await this.http.post(`https://graph.facebook.com/${this.version}/${this.accountId}/media`, body,
                { headers: this.headers() });
            children.push(data.id);
        }
        const { data } = await this.http.post(`https://graph.facebook.com/${this.version}/${this.accountId}/media`,
            { media_type: "CAROUSEL", children: children.join(","), caption: input.caption }, { headers: this.headers() });
        return { ...data, children, confirmationRequired: true };
    }
}

class FacebookPagePublishingClient {
    constructor(options = {}) {
        this.http = safeSocialHttp(options.http || axios);
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

    async uploadReel(uploadUrl, mediaUrl) {
        assertSocialOutboundAllowed(this.outboundPolicy, "facebook.upload-reel");
        requireHttps(uploadUrl, "rupload.facebook.com");
        requireHttps(mediaUrl);
        const { data } = await this.http.post(uploadUrl, null, { headers: { ...this.headers(), file_url: mediaUrl } });
        return data;
    }

    async getPostStatus(postId) {
        assertSocialOutboundAllowed(this.outboundPolicy, "facebook.get-post-status");
        const { data } = await this.http.get(`https://graph.facebook.com/${this.version}/${postId}`,
            { params: { fields: "id,permalink_url" }, headers: this.headers() });
        return data;
    }
}

class TikTokPublishingClient {
    constructor(options = {}) {
        this.http = safeSocialHttp(options.http || axios);
        this.accessToken = options.accessToken;
        this.outboundPolicy = createSocialOutboundPolicy(options.outboundPolicy);
        this.directPostAudited = options.directPostAudited === true;
        this.verifiedMediaUrlPrefix = options.verifiedMediaUrlPrefix || process.env.TIKTOK_VERIFIED_MEDIA_URL_PREFIX;
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
        if (!["draft-upload", "direct-post"].includes(mode)) throw Object.assign(new Error("INVALID_TIKTOK_MODE"), { code: "INVALID_TIKTOK_MODE", statusCode: 422 });
        if (mode === "direct-post" && (!this.directPostAudited || input.explicitConsent !== true || !input.postInfo?.privacy_level)) {
            throw Object.assign(new Error("TIKTOK_DIRECT_POST_REQUIRES_AUDIT_AND_CONSENT"), { code: "TIKTOK_DIRECT_POST_REQUIRES_AUDIT_AND_CONSENT", statusCode: 409 });
        }
        this.validateSource(input.sourceInfo);
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

    validateMediaUrl(value) {
        const url = requireHttps(value);
        if (!this.verifiedMediaUrlPrefix) throw Object.assign(new Error("TIKTOK_VERIFIED_MEDIA_PREFIX_REQUIRED"), { code: "TIKTOK_VERIFIED_MEDIA_PREFIX_REQUIRED", statusCode: 409 });
        const prefix = requireHttps(this.verifiedMediaUrlPrefix);
        if (url.origin !== prefix.origin || !url.pathname.startsWith(prefix.pathname.endsWith("/") ? prefix.pathname : `${prefix.pathname}/`)) {
            throw Object.assign(new Error("TIKTOK_MEDIA_URL_OUTSIDE_VERIFIED_PREFIX"), { code: "TIKTOK_MEDIA_URL_OUTSIDE_VERIFIED_PREFIX", statusCode: 422 });
        }
    }

    validateSource(source) {
        if (source?.source === "PULL_FROM_URL") return this.validateMediaUrl(source.video_url);
        if (source?.source !== "FILE_UPLOAD" || !Number.isSafeInteger(source.video_size) || source.video_size < 1 ||
            !Number.isSafeInteger(source.chunk_size) || source.chunk_size < 1 || source.chunk_size > 64 * 1024 * 1024 ||
            source.total_chunk_count !== Math.ceil(source.video_size / source.chunk_size)) {
            throw Object.assign(new Error("INVALID_TIKTOK_UPLOAD_SOURCE"), { code: "INVALID_TIKTOK_UPLOAD_SOURCE", statusCode: 422 });
        }
    }

    async uploadChunk(uploadUrl, bytes, start, total) {
        assertSocialOutboundAllowed(this.outboundPolicy, "tiktok.upload-chunk");
        requireHttps(uploadUrl, "open-upload.tiktokapis.com");
        if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 64 * 1024 * 1024 ||
            !Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(total) || start + bytes.length > total) {
            throw Object.assign(new Error("INVALID_TIKTOK_UPLOAD_CHUNK"), { code: "INVALID_TIKTOK_UPLOAD_CHUNK", statusCode: 422 });
        }
        const { data } = await this.http.put(uploadUrl, bytes, { headers: {
            "Content-Type": "video/mp4", "Content-Range": `bytes ${start}-${start + bytes.length - 1}/${total}`
        } });
        return data;
    }

    async initializePhotos(input) {
        assertSocialOutboundAllowed(this.outboundPolicy, "tiktok.initialize-photos.draft-upload");
        if (!Array.isArray(input.mediaUrls) || !input.mediaUrls.length || input.mediaUrls.length > 10) {
            throw Object.assign(new Error("INVALID_TIKTOK_PHOTOS"), { code: "INVALID_TIKTOK_PHOTOS", statusCode: 422 });
        }
        input.mediaUrls.forEach(url => this.validateMediaUrl(url));
        const { data } = await this.http.post("https://open.tiktokapis.com/v2/post/publish/content/init/", {
            post_info: { title: input.title, description: input.caption }, source_info: { source: "PULL_FROM_URL",
                photo_cover_index: 0, photo_images: input.mediaUrls }, post_mode: "MEDIA_UPLOAD", media_type: "PHOTO"
        }, { headers: this.headers() });
        return data;
    }

    async queryVideoMetrics(videoIds) {
        assertSocialOutboundAllowed(this.outboundPolicy, "tiktok.query-video-metrics");
        if (!Array.isArray(videoIds) || !videoIds.length || videoIds.length > 20) throw new Error("INVALID_TIKTOK_VIDEO_IDS");
        const { data } = await this.http.post("https://open.tiktokapis.com/v2/video/query/", { filters: { video_ids: videoIds } }, {
            params: { fields: "id,view_count,like_count,comment_count,share_count,duration,create_time" }, headers: this.headers()
        });
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
