const express = require("express");
const { SocialOAuthService } = require("../contentEngine/social/socialOAuthService");
function createSocialOAuthRoutes() {
    const router = express.Router();
    const service = new SocialOAuthService();
    router.get("/:provider/callback", async (req, res) => {
        try {
            await service.complete(req.params.provider, req.query.code, req.query.state);
            res.redirect("/admin#social");
        } catch (error) { res.status(409).json({ ok: false, error: error.code || "SOCIAL_OAUTH_FAILED" }); }
    });
    return router;
}
module.exports = { createSocialOAuthRoutes };
