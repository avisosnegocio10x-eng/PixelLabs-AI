const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { createMediaAssetRepository } = require("../repositories/mediaAssetRepository");
const { createCatalogRepository } = require("../repositories/catalogRepository");
const { scheduleError } = require("../repositories/publicationRepository");

const IMAGE_LIMIT = 8 * 1024 * 1024;
function sniffImage(bytes) {
    if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return { type: "image/png", ext: "png" };
    if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return { type: "image/jpeg", ext: "jpg" };
    if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return { type: "image/webp", ext: "webp" };
    throw scheduleError("UNSUPPORTED_IMAGE_FILE");
}

class ImageAssetService {
    constructor(options = {}) {
        this.media = options.media || createMediaAssetRepository();
        this.catalog = options.catalog || createCatalogRepository();
    }
    async upload(reference, bytes, confirmations) {
        if (!Buffer.isBuffer(bytes) || bytes.length < 32 || bytes.length > IMAGE_LIMIT) throw scheduleError("IMAGE_SIZE_LIMIT");
        if (confirmations.ownership !== "owned" || confirmations.privacy !== "clear") throw scheduleError("IMAGE_CONFIRMATIONS_REQUIRED");
        const product = await this.catalog.getByReference(reference);
        if (!product) throw scheduleError("PRODUCT_NOT_FOUND");
        const detected = sniffImage(bytes);
        const checksum = crypto.createHash("sha256").update(bytes).digest("hex");
        const id = crypto.randomUUID();
        const storagePath = `products/${product.reference}/${checksum}.${detected.ext}`;
        const record = { id, productReference: product.reference, type: "image", mimeType: detected.type,
            storageBucket: process.env.SUPABASE_STORAGE_BUCKET || "pixellabs-content", storagePath,
            checksum, ownershipStatus: "owned", privacyStatus: "clear", byteSize: bytes.length,
            metadata: { humanVerifiedAt: new Date().toISOString(), realProductConfirmed: true } };
        if (this.media.client) {
            const { data: existing, error: lookupError } = await this.media.client.from("media_assets")
                .select("id").eq("checksum_sha256", checksum).maybeSingle();
            if (lookupError) throw scheduleError("MEDIA_CATALOG_UNAVAILABLE");
            if (!existing) {
                const { error: uploadError } = await this.media.client.storage.from(record.storageBucket)
                    .upload(storagePath, bytes, { contentType: detected.type, upsert: false });
                if (uploadError) throw scheduleError("IMAGE_STORAGE_UPLOAD_FAILED");
                const { error: recordError } = await this.media.client.from("media_assets").insert({
                    id, storage_bucket: record.storageBucket, storage_path: storagePath, media_type: "image",
                    mime_type: detected.type, byte_size: bytes.length, checksum_sha256: checksum,
                    ownership_status: "owned", privacy_status: "clear", metadata: record.metadata
                });
                if (recordError) throw scheduleError("IMAGE_RECORD_FAILED");
            }
            const mediaId = existing?.id || id;
            const { error } = await this.media.client.from("product_media").upsert({
                product_id: product.id, media_asset_id: mediaId, role: "finished"
            }, { onConflict: "product_id,media_asset_id,role" });
            if (error) throw scheduleError("IMAGE_PRODUCT_LINK_FAILED");
            return this.media.get(mediaId);
        }
        const root = path.resolve(path.dirname(this.media.store.filePath), "images");
        await fs.mkdir(root, { recursive: true });
        await fs.writeFile(path.join(root, `${checksum}.${detected.ext}`), bytes, { flag: "w" });
        let saved;
        await this.media.store.update(doc => {
            saved = doc.media.find(row => row.checksum === checksum && row.productReference === reference);
            if (!saved) { saved = record; doc.media.push(record); }
        });
        return saved;
    }
}

module.exports = { ImageAssetService, IMAGE_LIMIT, sniffImage };
