const crypto = require("crypto");

function safeEqual(value, expected) {
    const first = Buffer.from(value || "");
    const second = Buffer.from(expected || "");

    return first.length === second.length && crypto.timingSafeEqual(first, second);
}

function requireAdminAuth(req, res, next) {
    const configuredToken = process.env.ADMIN_API_TOKEN;

    if (!configuredToken) {
        return res.status(503).json({
            ok: false,
            error: "ADMIN_AUTH_NOT_CONFIGURED",
            message: "Configura ADMIN_API_TOKEN antes de utilizar el panel."
        });
    }

    const authorization = req.get("authorization") || "";
    const bearer = authorization.startsWith("Bearer ")
        ? authorization.slice(7)
        : "";
    const suppliedToken = bearer || req.get("x-admin-token") || "";

    if (!safeEqual(suppliedToken, configuredToken)) {
        return res.status(401).json({
            ok: false,
            error: "UNAUTHORIZED"
        });
    }

    next();
}

module.exports = {
    requireAdminAuth,
    safeEqual
};
