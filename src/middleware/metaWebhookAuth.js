const crypto = require("crypto");

function validSignature(rawBody, header, appSecret) {
    if (!Buffer.isBuffer(rawBody) || !header || !appSecret) return false;
    const match = /^sha256=([a-f0-9]{64})$/i.exec(header);
    if (!match) return false;
    const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest();
    const supplied = Buffer.from(match[1], "hex");
    return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

function verifyMetaWebhookSignature(req, res, next) {
    const appSecret = process.env.META_APP_SECRET;
    if (!appSecret) {
        if (process.env.NODE_ENV === "production") {
            return res.status(503).json({
                ok: false,
                error: "META_WEBHOOK_SIGNATURE_NOT_CONFIGURED"
            });
        }
        return next();
    }
    if (!validSignature(req.rawBody, req.get("x-hub-signature-256"), appSecret)) {
        return res.status(401).json({ ok: false, error: "INVALID_WEBHOOK_SIGNATURE" });
    }
    next();
}

module.exports = {
    validSignature,
    verifyMetaWebhookSignature
};
