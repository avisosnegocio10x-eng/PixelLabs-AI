const { SOCIAL_CAPABILITIES, socialReadiness } = require("../social/capabilities");
const { createPlatformVariant } = require("../social/platformVariantService");
const { createContentRepository } = require("../repositories/contentRepository");
const { createCatalogRepository } = require("../repositories/catalogRepository");
const { SocialOAuthService } = require("../social/socialOAuthService");

function createSocialController(options = {}) {
    const content = options.content || createContentRepository();
    const catalog = options.catalog || createCatalogRepository();
    const oauth = options.oauth || new SocialOAuthService();
    return {
        connect: async (req, res, next) => {
            try { res.json({ ok: true, ...(await oauth.start(req.params.provider)) }); }
            catch (error) { next(error); }
        },
        accounts: async (req, res, next) => {
            try { res.json({ ok: true, accounts: (await oauth.repository.listAccounts()).map(row => ({
                id: row.id, platform: row.platform, displayName: row.display_name, status: row.status,
                permissions: row.permissions, lastVerifiedAt: row.last_verified_at, autoPublish: false
            })) }); } catch (error) { next(error); }
        },
        capabilities: (req, res) => {
            res.json({ ok: true, capabilities: SOCIAL_CAPABILITIES, readiness: socialReadiness() });
        },
        exportVariant: async (req, res, next) => {
            try {
                const item = await content.get(req.params.contentId);
                if (!item) return res.status(404).json({ ok: false, error: "CONTENT_NOT_FOUND" });
                if (item.status !== "APPROVED") {
                    return res.status(409).json({ ok: false, error: "CONTENT_NOT_MANUALLY_APPROVED" });
                }
                const product = await catalog.getByReference(item.productReference);
                if (!product || !["AVAILABLE", "LOW_STOCK"].includes(product.availabilityStatus)) {
                    return res.status(409).json({ ok: false, error: "PRODUCT_UNAVAILABLE" });
                }
                const variant = createPlatformVariant(item, product, req.params.platform);
                res.json({
                    ok: true,
                    variant,
                    publication: {
                        mode: "manual-package",
                        externalRequestSent: false,
                        autoPublish: false
                    }
                });
            } catch (error) { next(error); }
        }
    };
}

module.exports = {
    createSocialController
};
