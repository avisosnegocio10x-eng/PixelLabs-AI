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
                proxy_storage_path: manifest.proxyPath || null,
                status: manifest.status,
                progress: manifest.progress,
                error_code: manifest.errorCode || null,
                error_message: manifest.errorMessage || null,
                metadata: {
                    ranges: manifest.ranges,
                    media: manifest.media || null,
                    analysisSummary: manifest.analysis?.summary || null
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

    async syncAnalysis(manifest) {
        if (!this.client || !manifest.analysis) return null;
        const source = await this.upsert(manifest);
        const segmentIds = new Map();

        for (const segment of manifest.analysis.segments) {
            const { data, error } = await this.client.from("video_segments").upsert({
                source_video_id: source.id,
                segment_index: segment.index,
                start_ms: segment.startMs,
                end_ms: segment.endMs,
                storage_path: segment.path,
                status: segment.status,
                analysis: segment.analysis
            }, { onConflict: "source_video_id,segment_index" }).select("id,segment_index").single();
            if (error) throw new Error(`No se pudo registrar el segmento: ${error.message}`);
            segmentIds.set(data.segment_index, data.id);
        }

        const momentIds = new Map();
        for (const moment of manifest.analysis.moments) {
            const segment = manifest.analysis.segments.find(candidate => (
                moment.startMs >= candidate.startMs && moment.startMs < candidate.endMs
            ));
            const { data, error } = await this.client.from("detected_moments").upsert({
                source_video_id: source.id,
                video_segment_id: segment ? segmentIds.get(segment.index) : null,
                analysis_key: moment.analysisKey,
                moment_type: moment.type,
                start_ms: moment.startMs,
                end_ms: moment.endMs,
                score: moment.score,
                evidence: { ...moment.evidence, privacyStatus: moment.privacyStatus },
                privacy_risk: true
            }, { onConflict: "source_video_id,analysis_key" }).select("id,analysis_key").single();
            if (error) throw new Error(`No se pudo registrar el momento: ${error.message}`);
            momentIds.set(data.analysis_key, data.id);
        }

        for (const clip of manifest.analysis.clips) {
            const { error } = await this.client.from("video_clips").upsert({
                id: clip.id,
                source_video_id: source.id,
                detected_moment_id: momentIds.get(clip.detectedMomentKey) || null,
                start_ms: clip.startMs,
                end_ms: clip.endMs,
                topic: clip.topic,
                hook: clip.hook,
                on_screen_text: clip.onScreenText,
                caption: clip.caption,
                recommended_platforms: clip.recommendedPlatforms,
                score: clip.score,
                status: clip.status,
                fingerprint: clip.fingerprint,
                metadata: {
                    ...clip.metadata,
                    privacyStatus: clip.privacyStatus,
                    versions: clip.versions || []
                }
            }, { onConflict: "source_video_id,fingerprint" });
            if (error) throw new Error(`No se pudo registrar el clip: ${error.message}`);
        }
        return manifest.analysis.summary;
    }
}

module.exports = {
    VideoRepository
};
