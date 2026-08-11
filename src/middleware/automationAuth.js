const { safeEqual } = require("./adminAuth");

function requireAutomationAuth(req, res, next) {
    const configuredToken = process.env.N8N_WEBHOOK_SECRET;
    if (!configuredToken) {
        return res.status(503).json({
            ok: false,
            error: "AUTOMATION_AUTH_NOT_CONFIGURED"
        });
    }
    const authorization = req.get("authorization") || "";
    const suppliedToken = authorization.startsWith("Bearer ")
        ? authorization.slice(7)
        : "";
    if (!safeEqual(suppliedToken, configuredToken)) {
        return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
    }
    next();
}

module.exports = {
    requireAutomationAuth
};
