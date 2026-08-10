const crypto = require("crypto");
const { createCatalogRepository } = require("../repositories/catalogRepository");
const { createTrendRepository } = require("../repositories/trendRepository");
const { createEditorialPlanRepository } = require("../repositories/editorialPlanRepository");
const { ContentSettingsService } = require("./contentSettingsService");

const PLATFORMS = Object.freeze(["facebook", "instagram", "tiktok"]);
const CATEGORY_ROTATION = Object.freeze([
    "product", "educational", "trend", "process", "question"
]);

function assertDate(value) {
    const date = String(value || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T12:00:00Z`))) {
        throw Object.assign(new Error("Fecha editorial inválida."), {
            statusCode: 422,
            code: "INVALID_EDITORIAL_DATE"
        });
    }
    return date;
}

function offsetAt(date, time, timeZone) {
    const guess = new Date(`${date}T${time}:00Z`);
    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23"
    });
    const parts = Object.fromEntries(formatter.formatToParts(guess)
        .filter(part => part.type !== "literal").map(part => [part.type, part.value]));
    const rendered = Date.UTC(
        Number(parts.year), Number(parts.month) - 1, Number(parts.day),
        Number(parts.hour), Number(parts.minute), Number(parts.second)
    );
    return rendered - guess.getTime();
}

function localTimeToIso(date, time, timeZone) {
    const wallClock = Date.parse(`${date}T${time}:00Z`);
    let instant = wallClock - offsetAt(date, time, timeZone);
    const secondPass = offsetAt(
        new Date(instant).toISOString().slice(0, 10),
        new Date(instant).toISOString().slice(11, 16),
        timeZone
    );
    instant = wallClock - secondPass;
    return new Date(instant).toISOString();
}

function minutesToClock(minutes) {
    const normalized = Math.max(0, Math.min(1439, minutes));
    return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

function clockToMinutes(clock) {
    const [hour, minute] = clock.split(":").map(Number);
    return hour * 60 + minute;
}

function candidateTimes(preferred, target) {
    const result = [...preferred];
    let minute = 9 * 60;
    while (result.length < target) {
        const candidate = minutesToClock(minute);
        if (!result.includes(candidate)) result.push(candidate);
        minute += 90;
        if (minute > 22 * 60 + 30) minute = 9 * 60 + result.length * 5;
    }
    return result.slice(0, target);
}

class EditorialPlannerService {
    constructor(options = {}) {
        this.repository = options.repository || createEditorialPlanRepository();
        this.catalog = options.catalog || createCatalogRepository();
        this.trends = options.trends || createTrendRepository();
        this.settings = options.settings || new ContentSettingsService();
    }

    async list(date) {
        const day = assertDate(date);
        const settings = await this.settings.getSettings();
        const from = localTimeToIso(day, "00:00", settings.timezone);
        const nextDay = new Date(Date.parse(`${day}T12:00:00Z`) + 86400000)
            .toISOString().slice(0, 10);
        const to = localTimeToIso(nextDay, "00:00", settings.timezone);
        return this.repository.listRange(from, to);
    }

    async createPlan(input = {}) {
        const date = assertDate(input.date);
        const settings = await this.settings.getSettings();
        const dayOfWeek = new Date(`${date}T12:00:00Z`).getUTCDay();
        if (settings.restDays.includes(dayOfWeek)) {
            return { status: "REST_DAY", date, slots: [], requiresHumanApproval: true };
        }
        const requested = input.platforms?.length ? input.platforms : PLATFORMS;
        const platforms = [...new Set(requested)].filter(value => PLATFORMS.includes(value));
        if (!platforms.length) {
            throw Object.assign(new Error("Selecciona al menos una plataforma."), {
                statusCode: 422,
                code: "PLATFORM_REQUIRED"
            });
        }
        let products = await this.catalog.list({ promotableOnly: true, limit: 100 });
        if (input.productReference) {
            products = products.filter(product => product.reference === input.productReference);
        }
        if (!products.length) {
            return { status: "NO_PROMOTABLE_PRODUCTS", date, slots: [], requiresHumanApproval: true };
        }
        const trends = await this.trends.listCandidates({
            minimumScore: settings.minimumTrendScore,
            limit: 50
        });
        const from = localTimeToIso(date, "00:00", settings.timezone);
        const nextDay = new Date(Date.parse(`${date}T12:00:00Z`) + 86400000)
            .toISOString().slice(0, 10);
        const to = localTimeToIso(nextDay, "00:00", settings.timezone);
        const existing = await this.repository.listRange(from, to);
        const reserved = new Set(existing.map(slot => slot.plannedFor.slice(0, 16)));
        const slots = [];
        let categoryIndex = 0;
        let productIndex = 0;
        let trendIndex = 0;
        for (const platform of platforms) {
            const target = platform === "facebook"
                ? settings.dailyTargets.facebookPosts
                : platform === "instagram"
                    ? settings.dailyTargets.instagramPosts
                    : settings.dailyTargets.tiktokVideos;
            const times = candidateTimes(settings.preferredTimes[platform], target);
            for (let index = 0; index < target; index += 1) {
                let minute = clockToMinutes(times[index]);
                let plannedFor = localTimeToIso(date, minutesToClock(minute), settings.timezone);
                let attempts = 0;
                while (reserved.has(plannedFor.slice(0, 16)) && attempts < 24) {
                    minute += 5;
                    if (minute > 1439) break;
                    plannedFor = localTimeToIso(date, minutesToClock(minute), settings.timezone);
                    attempts += 1;
                }
                if (minute > 1439 || reserved.has(plannedFor.slice(0, 16))) continue;
                reserved.add(plannedFor.slice(0, 16));
                const category = CATEGORY_ROTATION[categoryIndex % CATEGORY_ROTATION.length];
                categoryIndex += 1;
                const product = products[productIndex % products.length];
                productIndex += 1;
                const trend = category === "trend" && trends.length
                    ? trends[trendIndex++ % trends.length]
                    : null;
                const format = platform === "tiktok"
                    ? "short_video"
                    : category === "process" || category === "trend"
                        ? "reel"
                        : category === "educational" && settings.dailyTargets.carousels > 0
                            ? "carousel"
                            : "post";
                const concept = trend
                    ? `Adaptar la tendencia “${trend.name}” al producto ${product.name} sin copiar contenido ajeno.`
                    : `${category}: presentar ${product.name} con material propio de PixelLabs.`;
                const planKey = crypto.createHash("sha256").update(JSON.stringify({
                    date, platform, plannedFor, category, product: product.reference,
                    trend: trend?.id || null
                })).digest("hex");
                slots.push({
                    productId: product.id,
                    trendId: trend?.id || null,
                    campaignId: input.campaignId || null,
                    objective: category === "question" ? "engagement" : "qualified_messages",
                    category,
                    concept,
                    targetAudience: input.targetAudience || null,
                    recommendedFormats: [format],
                    recommendationScore: trend?.score?.overallScore || product.popularityScore || 50,
                    status: "PROPOSED",
                    platform,
                    plannedFor,
                    planKey,
                    metadata: {
                        productReference: product.reference,
                        requiresHumanApproval: true,
                        autoPublish: false,
                        generatedBy: "editorial-planner-v1"
                    }
                });
            }
        }
        const saved = await this.repository.upsertMany(slots);
        return {
            status: saved.length ? "PLAN_READY" : "NO_SLOTS_CREATED",
            date,
            slots: saved,
            requiresHumanApproval: true,
            autoPublish: false
        };
    }
}

module.exports = {
    EditorialPlannerService,
    localTimeToIso,
    candidateTimes,
    CATEGORY_ROTATION
};
