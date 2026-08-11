const { safeEqual } = require("./adminAuth");

const WORKER_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,79}$/;

function requireLocalWorkerAuth(req, res, next) {
    const configuredToken = process.env.LOCAL_WORKER_API_TOKEN;
    if (!configuredToken) {
        return res.status(503).json({
            ok: false,
            error: "LOCAL_WORKER_AUTH_NOT_CONFIGURED"
        });
    }

    const authorization = req.get("authorization") || "";
    const suppliedToken = authorization.startsWith("Bearer ")
        ? authorization.slice(7)
        : "";
    const workerId = req.get("x-worker-id") || "";

    if (!safeEqual(suppliedToken, configuredToken)) {
        return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
    }
    if (!WORKER_ID_PATTERN.test(workerId)) {
        return res.status(400).json({ ok: false, error: "INVALID_WORKER_ID" });
    }

    req.localWorkerId = workerId;
    next();
}

module.exports = {
    requireLocalWorkerAuth,
    WORKER_ID_PATTERN
};
