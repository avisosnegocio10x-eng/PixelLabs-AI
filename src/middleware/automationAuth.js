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
    if (
        process.env.NODE_ENV === "production" &&
        process.env.N8N_REQUIRE_HTTPS !== "false" &&
        !req.secure
    ) {
        return res.status(400).json({
            ok: false,
            error: "AUTOMATION_HTTPS_REQUIRED"
        });
    }
    next();
}

module.exports = {
    requireAutomationAuth
};
