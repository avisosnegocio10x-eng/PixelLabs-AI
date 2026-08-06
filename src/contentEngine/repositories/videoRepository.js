const { getSupabaseAdminClient } = require("../db/supabaseClient");

class VideoRepository {
    constructor(client = getSupabaseAdminClient()) {
        this.client = client;
    }

    async upsert(manifest) {
        if (!this.client) {
            return null;
        }

        const { data, error } = await this.client
            .from("source_videos")
            .upsert({
                upload_id: manifest.uploadId,
                original_filename: manifest.originalFilename,
                mime_type: manifest.mimeType,
                byte_size: manifest.totalBytes,
                received_bytes: manifest.receivedBytes,
                duration_ms: manifest.media?.durationMs || null,
                checksum_sha256: manifest.checksumSha256 || null,
                storage_path: manifest.filePath || null,
                status: manifest.status,
                progress: manifest.progress,
                error_code: manifest.errorCode || null,
                error_message: manifest.errorMessage || null,
                metadata: {
                    ranges: manifest.ranges,
                    media: manifest.media || null
                },
                updated_at: new Date().toISOString()
            }, { onConflict: "upload_id" })
            .select("id")
            .single();

        if (error) {
            throw new Error(`No se pudo registrar el video: ${error.message}`);
        }

        return data;
    }
}

module.exports = {
    VideoRepository
};
