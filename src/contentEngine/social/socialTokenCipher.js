const crypto = require("crypto");

function readKey(value = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY) {
    if (!value) {
        throw Object.assign(new Error("Falta SOCIAL_TOKEN_ENCRYPTION_KEY."), {
            code: "SOCIAL_TOKEN_ENCRYPTION_NOT_CONFIGURED"
        });
    }
    const key = Buffer.from(value, "base64");
    if (key.length !== 32) {
        throw Object.assign(new Error("SOCIAL_TOKEN_ENCRYPTION_KEY debe contener 32 bytes en base64."), {
            code: "INVALID_SOCIAL_TOKEN_ENCRYPTION_KEY"
        });
    }
    return key;
}

function encryptSecret(secret, keyValue) {
    const key = readKey(keyValue);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(String(secret), "utf8"), cipher.final()]);
    return {
        ciphertext: ciphertext.toString("base64"),
        iv: iv.toString("base64"),
        tag: cipher.getAuthTag().toString("base64")
    };
}

function decryptSecret(record, keyValue) {
    const key = readKey(keyValue);
    const decipher = crypto.createDecipheriv(
        "aes-256-gcm",
        key,
        Buffer.from(record.iv, "base64")
    );
    decipher.setAuthTag(Buffer.from(record.tag, "base64"));
    return Buffer.concat([
        decipher.update(Buffer.from(record.ciphertext, "base64")),
        decipher.final()
    ]).toString("utf8");
}

module.exports = {
    readKey,
    encryptSecret,
    decryptSecret
};
