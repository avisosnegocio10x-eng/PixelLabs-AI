const DEFAULT_CONTENT_SETTINGS = Object.freeze({
    enabled: true,
    autoPublish: false,
    timezone: "America/El_Salvador",
    approvalMode: "manual",
    minimumTrendScore: 70,
    thresholds: {
        automaticApproval: 95,
        humanApproval: 85
    },
    maxCorrectionAttempts: 3,
    reuseCooldownDays: 15,
    dailyTargets: {
        staticPosts: 4,
        carousels: 0,
        stories: 2,
        reels: 1,
        tiktokVideos: 1,
        facebookPosts: 4,
        instagramPosts: 4
    },
    platformAutomation: {
        facebook: false,
        instagram: false,
        tiktok: false
    },
    preferredTimes: {
        facebook: ["09:00", "12:30", "15:30", "20:00"],
        instagram: ["09:00", "12:30", "18:30", "20:00"],
        tiktok: ["18:30"]
    },
    restDays: [],
    retentionDays: 30,
    video: {
        maxUploadBytes: 50 * 1024 * 1024 * 1024,
        chunkBytes: 8 * 1024 * 1024,
        maxConcurrentJobs: 1
    }
});

function cloneDefaultSettings() {
    return JSON.parse(JSON.stringify(DEFAULT_CONTENT_SETTINGS));
}

module.exports = {
    DEFAULT_CONTENT_SETTINGS,
    cloneDefaultSettings
};
