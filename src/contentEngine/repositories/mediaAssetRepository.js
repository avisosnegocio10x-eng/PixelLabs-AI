const path = require("path");
const fs = require("fs/promises");
const { JsonDocumentStore } = require("./jsonDocumentStore");
const { getSupabaseAdminClient, hasSupabaseConfiguration } = require("../db/supabaseClient");

function mapMedia(row) {
    return {
        id: row.id, type: row.media_type || row.type, mimeType: row.mime_type || row.mimeType,
        storageBucket: row.storage_bucket || row.storageBucket,
        storagePath: row.storage_path || row.storagePath,
        checksum: row.checksum_sha256 || row.checksum,
        ownershipStatus: row.ownership_status || row.ownershipStatus,
        privacyStatus: row.privacy_status || row.privacyStatus,
        width: row.width, height: row.height, durationMs: row.duration_ms || row.durationMs,
        metadata: row.metadata || {}
    };
}

class FileMediaAssetRepository {
    constructor(filePath = path.resolve(process.env.CONTENT_ENGINE_WORK_DIR || "./storage/work", "media-assets.json")) {
        this.store = new JsonDocumentStore(filePath, { media: [] });
    }
    async forProduct(product) {
        return (await this.store.read()).media.filter(item => item.productReference === product.reference).map(mapMedia);
    }
    async get(id) { const item = (await this.store.read()).media.find(item => item.id === id); return item ? mapMedia(item) : null; }
    async preview(id) {
        const asset = await this.get(id);
        if (!asset || asset.type !== "image" || asset.privacyStatus !== "clear" || !/^[a-f0-9]{64}$/.test(asset.checksum)) return null;
        const ext = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[asset.mimeType];
        if (!ext) return null;
        const filename = path.join(path.dirname(this.store.filePath), "images", `${asset.checksum}.${ext}`);
        const bytes = await fs.readFile(filename);
        if (bytes.length > 8 * 1024 * 1024) return null;
        return `data:${asset.mimeType};base64,${bytes.toString("base64")}`;
    }
}

class SupabaseMediaAssetRepository {
    constructor(client = getSupabaseAdminClient()) { this.client = client; }
    async forProduct(product) {
        const { data, error } = await this.client.from("product_media")
            .select("media_assets(*)").eq("product_id", product.id).order("sort_order");
        if (error) throw new Error("MEDIA_CATALOG_UNAVAILABLE");
        return [...new Map((data || []).filter(row => row.media_assets).map(row => {
            const asset = mapMedia(row.media_assets); return [asset.id, asset];
        })).values()];
    }
    async get(id) {
        const { data, error } = await this.client.from("media_assets").select("*").eq("id", id).maybeSingle();
        if (error) throw new Error("MEDIA_ASSET_UNAVAILABLE");
        return data ? mapMedia(data) : null;
    }
    async preview(id) {
        const asset = await this.get(id);
        if (!asset || asset.privacyStatus !== "clear") return null;
        const { data, error } = await this.client.storage.from(asset.storageBucket).createSignedUrl(asset.storagePath, 300);
        if (error) throw new Error("MEDIA_PREVIEW_UNAVAILABLE");
        return data.signedUrl;
    }
}

function createMediaAssetRepository() {
    return hasSupabaseConfiguration() ? new SupabaseMediaAssetRepository() : new FileMediaAssetRepository();
}
module.exports = { mapMedia, FileMediaAssetRepository, SupabaseMediaAssetRepository, createMediaAssetRepository };
