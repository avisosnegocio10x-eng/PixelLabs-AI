const test = require("node:test");
const assert = require("node:assert/strict");
const { InstagramPublishingClient, TikTokPublishingClient, FacebookPagePublishingClient } = require("../../src/contentEngine/social/officialApiClients");
const policy = { mode: "live", externalRequestsEnabled: true, allowOutbound: true, approvalId: "qa-only-approval" };

test("Instagram carousel creates child containers without publishing; Facebook Reel upload stays on Meta's host", async () => {
    const calls = [];
    const http = { post: async (url, body, options) => { calls.push({ url, body, options }); return { data: { id: `qa-${calls.length}` } }; } };
    const instagram = new InstagramPublishingClient({ http, version: "v99.0", accountId: "qa", accessToken: "qa-token", outboundPolicy: policy });
    const result = await instagram.createCarousel({ caption: "QA only", items: [ { mediaUrl: "https://example.test/a.jpg" }, { mediaUrl: "https://example.test/b.jpg" } ] });
    assert.equal(result.children.length, 2);
    assert.equal(calls.length, 3);
    assert.ok(calls.every(call => !call.url.includes("media_publish")));
    assert.equal(calls[2].body.media_type, "CAROUSEL");
    const facebook = new FacebookPagePublishingClient({ http, version: "v99.0", pageId: "qa", accessToken: "qa-token", outboundPolicy: policy });
    await assert.rejects(facebook.uploadReel("https://example.test/upload", "https://example.test/video.mp4"), error => error.code === "MEDIA_URL_INVALID");
    assert.equal(calls.length, 3);
});

test("TikTok defaults to inbox upload and rejects unverified URLs and unaudited direct posts", async () => {
    const calls = [];
    const http = { post: async (url, body) => { calls.push({ url, body }); return { data: { data: { publish_id: "qa-inbox" }, error: { code: "ok" } } }; } };
    const client = new TikTokPublishingClient({ http, accessToken: "qa-token", outboundPolicy: policy });
    await client.initializeVideo({ sourceInfo: { source: "FILE_UPLOAD", video_size: 100, chunk_size: 100, total_chunk_count: 1 } });
    assert.ok(calls[0].url.endsWith("/inbox/video/init/"));
    assert.equal(calls[0].body.post_info, undefined);
    await assert.rejects(client.initializeVideo({ sourceInfo: { source: "PULL_FROM_URL", video_url: "https://example.test/qa.mp4" } }),
        error => error.code === "TIKTOK_VERIFIED_MEDIA_PREFIX_REQUIRED");
    await assert.rejects(client.initializeVideo({ postInfo: { privacy_level: "SELF_ONLY" }, explicitConsent: true }, "direct-post"),
        error => error.code === "TIKTOK_DIRECT_POST_REQUIRES_AUDIT_AND_CONSENT");
    assert.equal(calls.length, 1);
});
