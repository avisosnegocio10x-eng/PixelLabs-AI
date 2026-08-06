const { z } = require("zod");

const dailyCount = z.number().int().min(0).max(20);
const score = z.number().int().min(0).max(100);
const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const contentSettingsSchema = z.object({
    enabled: z.boolean(),
    autoPublish: z.boolean(),
    timezone: z.string().min(1).max(100),
    approvalMode: z.enum(["manual", "partial", "advanced"]),
    minimumTrendScore: score,
    thresholds: z.object({
        automaticApproval: score,
        humanApproval: score
    }).strict(),
    maxCorrectionAttempts: z.number().int().min(0).max(10),
    reuseCooldownDays: z.number().int().min(0).max(365),
    dailyTargets: z.object({
        staticPosts: dailyCount,
        carousels: dailyCount,
        stories: dailyCount,
        reels: dailyCount,
        tiktokVideos: dailyCount,
        facebookPosts: dailyCount,
        instagramPosts: dailyCount
    }).strict(),
    platformAutomation: z.object({
        facebook: z.boolean(),
        instagram: z.boolean(),
        tiktok: z.boolean()
    }).strict(),
    preferredTimes: z.object({
        facebook: z.array(clockTime).max(20),
        instagram: z.array(clockTime).max(20),
        tiktok: z.array(clockTime).max(20)
    }).strict(),
    restDays: z.array(z.number().int().min(0).max(6)).max(7),
    retentionDays: z.number().int().min(1).max(3650),
    video: z.object({
        maxUploadBytes: z.number().int().min(1024 * 1024),
        chunkBytes: z.number().int().min(1024 * 1024).max(128 * 1024 * 1024),
        maxConcurrentJobs: z.number().int().min(1).max(10)
    }).strict()
}).strict().superRefine((value, context) => {
    if (value.thresholds.humanApproval > value.thresholds.automaticApproval) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["thresholds", "humanApproval"],
            message: "El umbral humano no puede superar el umbral automático."
        });
    }

    if (value.autoPublish && value.approvalMode === "manual") {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["autoPublish"],
            message: "La publicación automática no puede activarse en modo manual."
        });
    }

    if (new Set(value.restDays).size !== value.restDays.length) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["restDays"],
            message: "Los días de descanso no pueden repetirse."
        });
    }
});

module.exports = {
    contentSettingsSchema
};
