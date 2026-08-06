const SOCIAL_CAPABILITIES = Object.freeze({
    facebook: {
        accountType: "Facebook Page",
        formats: ["page-post", "image", "video", "reel", "story"],
        unsupported: ["marketplace-listing", "personal-profile-post"],
        requirements: [
            "Meta app",
            "Facebook Page access token",
            "Page permissions approved for the selected operation"
        ],
        confirmationRequired: true,
        officialDocs: [
            "https://developers.facebook.com/documentation/pages-api/posts",
            "https://developers.facebook.com/documentation/video-api/guides/reels-publishing",
            "https://developers.facebook.com/documentation/video-api/page-stories-api"
        ]
    },
    instagram: {
        accountType: "Instagram professional account",
        formats: ["image", "video", "reel", "carousel", "story"],
        unsupported: ["consumer-account-publishing"],
        requirements: [
            "Professional Instagram account",
            "Compatible Meta app and login model",
            "Content publishing permission",
            "Publicly reachable media URL"
        ],
        rollingApiPostLimit24h: 100,
        confirmationRequired: true,
        officialDocs: [
            "https://developers.facebook.com/documentation/instagram-platform/content-publishing",
            "https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/media"
        ]
    },
    tiktok: {
        accountType: "Authorized TikTok creator",
        formats: ["video", "photo"],
        modes: ["draft-upload", "direct-post"],
        requirements: [
            "TikTok developer app",
            "Content Posting API product",
            "video.upload for drafts or video.publish for Direct Post",
            "User OAuth authorization"
        ],
        unauditedDirectPostVisibility: "SELF_ONLY",
        confirmationRequired: true,
        officialDocs: [
            "https://developers.tiktok.com/doc/content-posting-api-get-started",
            "https://developers.tiktok.com/doc/content-posting-api-get-started-upload-content"
        ]
    }
});

function assertSupported(platform, format) {
    const capability = SOCIAL_CAPABILITIES[platform];
    if (!capability) {
        throw Object.assign(new Error("Plataforma social desconocida."), {
            statusCode: 404,
            code: "UNKNOWN_SOCIAL_PLATFORM"
        });
    }
    if (!capability.formats.includes(format)) {
        throw Object.assign(new Error("El formato no está soportado por la API oficial seleccionada."), {
            statusCode: 422,
            code: "UNSUPPORTED_SOCIAL_FORMAT"
        });
    }
    return capability;
}

function socialReadiness(env = process.env) {
    return {
        mode: env.SOCIAL_PUBLISH_MODE || "draft",
        autoPublish: false,
        facebook: {
            configured: Boolean(env.META_APP_ID && env.META_APP_SECRET && env.FACEBOOK_PAGE_ID),
            liveEnabled: (env.SOCIAL_PUBLISH_MODE || "draft") === "live"
        },
        instagram: {
            configured: Boolean(env.META_APP_ID && env.META_APP_SECRET && env.INSTAGRAM_BUSINESS_ACCOUNT_ID),
            liveEnabled: (env.SOCIAL_PUBLISH_MODE || "draft") === "live"
        },
        tiktok: {
            configured: Boolean(env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET && env.TIKTOK_REDIRECT_URI),
            liveEnabled: (env.SOCIAL_PUBLISH_MODE || "draft") === "live"
        }
    };
}

module.exports = {
    SOCIAL_CAPABILITIES,
    assertSupported,
    socialReadiness
};
