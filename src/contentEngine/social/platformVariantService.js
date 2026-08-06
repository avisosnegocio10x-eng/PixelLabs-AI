const { assertSupported } = require("./capabilities");

function normalizeHashtags(hashtags, max) {
    return [...new Set((hashtags || []).map(tag => (
        tag.startsWith("#") ? tag : `#${tag.replace(/\s+/g, "")}`
    )))].slice(0, max);
}

function createPlatformVariant(item, product, platform) {
    const baseText = item.primaryText || item.title || product.name;
    const cta = item.callToAction || "Escríbenos para cotizar.";
    let caption;
    let format = item.format;
    if (platform === "tiktok") {
        format = item.format === "image" ? "photo" : "video";
        assertSupported(platform, format);
        caption = `${item.title ? `${item.title}\n` : ""}${baseText}\n${cta}\n${normalizeHashtags(item.hashtags, 5).join(" ")}`.trim();
    } else if (platform === "instagram") {
        format = ["image", "carousel", "story", "reel", "video"].includes(item.format)
            ? item.format
            : "image";
        assertSupported(platform, format);
        caption = `${baseText}\n\n${cta}\n\n${normalizeHashtags(item.hashtags, 12).join(" ")}`.trim();
    } else {
        format = item.format === "reel" ? "reel" : item.format === "story" ? "story" : item.format === "video" ? "video" : "page-post";
        assertSupported(platform, format);
        caption = `${baseText}\n\n${cta}\nEnvíos a todo El Salvador.`.trim();
    }
    return {
        platform,
        format,
        title: item.title,
        caption,
        status: "DRAFT",
        requiresHumanApproval: true,
        autoPublish: false,
        productReference: product.reference,
        productAvailability: product.availabilityStatus,
        preparedAt: new Date().toISOString()
    };
}

module.exports = {
    createPlatformVariant,
    normalizeHashtags
};
