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
                    ...(manifest.metadata || {}),
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

    async persistRemoteArtifact(job, artifact, workerId, bucket) {
        const existingResponse = await this.client.from("media_assets")
            .select("id,storage_bucket,storage_path,byte_size,mime_type")
            .eq("checksum_sha256", artifact.checksumSha256)
            .maybeSingle();
        if (existingResponse.error) {
            throw new Error(`No se pudo comprobar el artefacto: ${existingResponse.error.message}`);
        }
        if (existingResponse.data) {
            const existing = existingResponse.data;
            if (
                Number(existing.byte_size) !== Number(artifact.byteSize) ||
                existing.mime_type !== artifact.contentType
            ) {
                throw Object.assign(new Error("El checksum coincide con metadatos incompatibles."), {
                    code: "ARTIFACT_CHECKSUM_CONFLICT"
                });
            }
            if (
                existing.storage_bucket === bucket &&
                existing.storage_path !== artifact.storagePath
            ) {
                await this.client.storage.from(bucket)
                    .remove([artifact.storagePath])
                    .catch(() => null);
            }
            return existing.id;
        }

        const mediaType = artifact.artifactType === "clip-video"
            ? "video"
            : artifact.artifactType === "cover" ? "image" : "subtitle";
        const { data, error } = await this.client.from("media_assets").upsert({
            storage_bucket: bucket,
            storage_path: artifact.storagePath,
            original_filename: artifact.filename,
            media_type: mediaType,
            mime_type: artifact.contentType,
            byte_size: artifact.byteSize,
            checksum_sha256: artifact.checksumSha256,
            ownership_status: "owned",
            privacy_status: "unchecked",
            metadata: {
                source: "local-worker",
                jobId: job.id,
                workerId,
                artifactType: artifact.artifactType
            }
        }, { onConflict: "storage_bucket,storage_path" })
            .select("id")
            .single();
        if (error) throw new Error(`No se pudo registrar el artefacto: ${error.message}`);
        return data.id;
    }

    async syncRemoteResult(job, result, workerId, bucket) {
        if (!this.client) return null;
        const manifest = {
            uploadId: `local-${job.id}`,
            originalFilename: result.source.filename,
            mimeType: result.source.mimeType,
            totalBytes: result.source.byteSize,
            receivedBytes: result.source.byteSize,
            media: { durationMs: result.source.durationMs },
            checksumSha256: result.source.checksumSha256 || null,
            filePath: null,
            proxyPath: null,
            status: "COMPLETED",
            progress: 100,
            analysis: result.analysis,
            ranges: [],
            metadata: {
                execution: "local-worker",
                workerId,
                sourceStoredLocally: true
            }
        };
        await this.syncAnalysis(manifest);

        const assetIds = new Map();
        for (const artifact of result.artifacts || []) {
            assetIds.set(
                artifact.storagePath,
                await this.persistRemoteArtifact(job, artifact, workerId, bucket)
            );
        }

        const versions = new Map();
        for (const artifact of result.artifacts || []) {
            if (!artifact.clipId || !artifact.version) continue;
            const key = `${artifact.clipId}:${artifact.version}`;
            const entry = versions.get(key) || {
                clipId: artifact.clipId,
                version: artifact.version,
                style: artifact.style || "process-real",
                mediaAssetId: null,
                coverAssetId: null,
                subtitleAssetId: null
            };
            const assetId = assetIds.get(artifact.storagePath);
            if (artifact.artifactType === "clip-video") entry.mediaAssetId = assetId;
            if (artifact.artifactType === "cover") entry.coverAssetId = assetId;
            if (artifact.artifactType === "subtitle") entry.subtitleAssetId = assetId;
            versions.set(key, entry);
        }

        for (const version of versions.values()) {
            if (!version.mediaAssetId) continue;
            const { error: deleteError } = await this.client.from("clip_versions")
                .delete()
                .eq("video_clip_id", version.clipId)
                .eq("version", version.version)
                .is("platform", null);
            if (deleteError) throw new Error(`No se pudo reemplazar la versión: ${deleteError.message}`);
            const { error } = await this.client.from("clip_versions").insert({
                video_clip_id: version.clipId,
                version: version.version,
                style: version.style,
                platform: null,
                media_asset_id: version.mediaAssetId,
                subtitle_asset_id: version.subtitleAssetId,
                cover_asset_id: version.coverAssetId,
                render_settings: {
                    execution: "local-worker",
                    automaticEffects: false,
                    automaticPublishEligible: false
                },
                status: "DRAFT"
            });
            if (error) throw new Error(`No se pudo registrar la versión: ${error.message}`);
            const { error: clipError } = await this.client.from("video_clips")
                .update({ status: "DRAFT" })
                .eq("id", version.clipId);
            if (clipError) throw new Error(`No se pudo actualizar el clip: ${clipError.message}`);
        }

        return {
            sourceUploadId: manifest.uploadId,
            clips: result.analysis.clips.length,
            artifacts: result.artifacts?.length || 0
        };
    }

    async listRemoteVideos() {
        if (!this.client) return [];
        const { data: videos, error } = await this.client.from("source_videos")
            .select("id,upload_id,original_filename,mime_type,byte_size,duration_ms,status,progress,error_code,metadata,created_at,updated_at")
            .order("created_at", { ascending: false })
            .limit(250);
        if (error) throw new Error(`No se pudo leer la biblioteca de videos: ${error.message}`);
        const ids = (videos || []).map(video => video.id);
        let clips = [];
        if (ids.length) {
            const response = await this.client.from("video_clips")
                .select("source_video_id,status")
                .in("source_video_id", ids);
            if (response.error) {
                throw new Error(`No se pudieron contar los clips: ${response.error.message}`);
            }
            clips = response.data || [];
        }
        return (videos || []).map(video => {
            const related = clips.filter(clip => clip.source_video_id === video.id);
            return {
                uploadId: video.upload_id,
                originalFilename: video.original_filename,
                mimeType: video.mime_type,
                totalBytes: Number(video.byte_size || 0),
                durationMs: video.duration_ms === null ? null : Number(video.duration_ms),
                status: video.status,
                processingStage: video.status === "COMPLETED" ? "READY_FOR_REVIEW" : null,
                progress: video.progress,
                clipsFound: related.length,
                clipsApproved: related.filter(clip => clip.status === "APPROVED").length,
                errorCode: video.error_code,
                sourceLocation: video.metadata?.sourceStoredLocally ? "local-worker" : "storage",
                createdAt: video.created_at,
                updatedAt: video.updated_at
            };
        });
    }

    async signedAsset(asset) {
        if (!asset) return null;
        const { data, error } = await this.client.storage
            .from(asset.storage_bucket)
            .createSignedUrl(asset.storage_path, 15 * 60, { download: false });
        return {
            id: asset.id,
            filename: asset.original_filename,
            mimeType: asset.mime_type,
            byteSize: asset.byte_size === null ? null : Number(asset.byte_size),
            privacyStatus: asset.privacy_status,
            signedUrl: error ? null : data?.signedUrl || null,
            expiresInSeconds: 15 * 60
        };
    }

    async listRemoteClips(filters = {}) {
        if (!this.client) return [];
        let query = this.client.from("video_clips")
            .select("id,source_video_id,start_ms,end_ms,duration_ms,topic,hook,on_screen_text,caption,recommended_platforms,score,status,fingerprint,metadata,created_at,updated_at")
            .order("created_at", { ascending: false })
            .limit(500);
        if (filters.status) query = query.eq("status", filters.status);
        if (filters.platform) query = query.contains("recommended_platforms", [filters.platform]);
        const { data: clips, error } = await query;
        if (error) throw new Error(`No se pudo leer la biblioteca de clips: ${error.message}`);
        if (!clips?.length) return [];

        const sourceIds = [...new Set(clips.map(clip => clip.source_video_id))];
        const clipIds = clips.map(clip => clip.id);
        const [sourceResponse, versionResponse] = await Promise.all([
            this.client.from("source_videos")
                .select("id,upload_id,original_filename")
                .in("id", sourceIds),
            this.client.from("clip_versions")
                .select("id,video_clip_id,version,style,platform,media_asset_id,subtitle_asset_id,cover_asset_id,quality_score,status,render_settings,created_at")
                .in("video_clip_id", clipIds)
                .order("version", { ascending: false })
        ]);
        if (sourceResponse.error) {
            throw new Error(`No se pudieron leer las fuentes: ${sourceResponse.error.message}`);
        }
        if (versionResponse.error) {
            throw new Error(`No se pudieron leer las versiones: ${versionResponse.error.message}`);
        }
        const assetIds = [...new Set((versionResponse.data || []).flatMap(version => [
            version.media_asset_id,
            version.subtitle_asset_id,
            version.cover_asset_id
        ]).filter(Boolean))];
        let assets = [];
        if (assetIds.length) {
            const assetResponse = await this.client.from("media_assets")
                .select("id,storage_bucket,storage_path,original_filename,mime_type,byte_size,privacy_status")
                .in("id", assetIds);
            if (assetResponse.error) {
                throw new Error(`No se pudieron leer los archivos: ${assetResponse.error.message}`);
            }
            assets = assetResponse.data || [];
        }
        const sourceMap = new Map((sourceResponse.data || []).map(source => [source.id, source]));
        const assetMap = new Map(assets.map(asset => [asset.id, asset]));

        return Promise.all(clips.map(async clip => {
            const source = sourceMap.get(clip.source_video_id) || {};
            const versions = (versionResponse.data || [])
                .filter(version => version.video_clip_id === clip.id);
            const hydratedVersions = [];
            for (const version of versions) {
                const [media, cover, subtitle] = await Promise.all([
                    this.signedAsset(assetMap.get(version.media_asset_id)),
                    this.signedAsset(assetMap.get(version.cover_asset_id)),
                    this.signedAsset(assetMap.get(version.subtitle_asset_id))
                ]);
                hydratedVersions.push({
                    id: version.id,
                    version: version.version,
                    style: version.style,
                    platform: version.platform,
                    status: version.status,
                    qualityScore: version.quality_score,
                    renderSettings: version.render_settings,
                    media,
                    cover,
                    subtitle,
                    createdAt: version.created_at
                });
            }
            return {
                id: clip.id,
                uploadId: source.upload_id || `local-${clip.source_video_id}`,
                originalFilename: source.original_filename || "Video local",
                startMs: Number(clip.start_ms),
                endMs: Number(clip.end_ms),
                durationMs: Number(clip.duration_ms),
                topic: clip.topic,
                hook: clip.hook,
                onScreenText: clip.on_screen_text,
                caption: clip.caption,
                recommendedPlatforms: clip.recommended_platforms || [],
                score: clip.score === null ? null : Number(clip.score),
                status: clip.status,
                fingerprint: clip.fingerprint,
                privacyStatus: clip.metadata?.privacyStatus || "PENDING_HUMAN_REVIEW",
                metadata: clip.metadata || {},
                versions: hydratedVersions,
                createdAt: clip.created_at,
                updatedAt: clip.updated_at
            };
        }));
    }

    async reviewRemoteClip(clipId, input) {
        if (!this.client) {
            throw Object.assign(new Error("Supabase no está configurado."), {
                statusCode: 503,
                code: "SUPABASE_NOT_CONFIGURED"
            });
        }
        const { data: clip, error } = await this.client.from("video_clips")
            .select("id,status,metadata")
            .eq("id", clipId)
            .maybeSingle();
        if (error) throw new Error(`No se pudo leer el clip: ${error.message}`);
        if (!clip) {
            throw Object.assign(new Error("Clip no encontrado."), {
                statusCode: 404,
                code: "CLIP_NOT_FOUND"
            });
        }
        const versionResponse = await this.client.from("clip_versions")
            .select("id,version,status,media_asset_id,cover_asset_id,subtitle_asset_id")
            .eq("video_clip_id", clipId)
            .order("version", { ascending: false })
            .limit(1);
        if (versionResponse.error) {
            throw new Error(`No se pudo leer la versión del clip: ${versionResponse.error.message}`);
        }
        const version = versionResponse.data?.[0] || null;
        if (input.decision === "APPROVE") {
            if (!input.privacyCleared) {
                throw Object.assign(new Error("La revisión de privacidad es obligatoria."), {
                    statusCode: 409,
                    code: "CLIP_PRIVACY_NOT_CLEARED"
                });
            }
            if (input.qualityScore < 85) {
                throw Object.assign(new Error("La calidad del clip es insuficiente."), {
                    statusCode: 409,
                    code: "CLIP_QUALITY_TOO_LOW"
                });
            }
            if (!version || version.status !== "DRAFT") {
                throw Object.assign(new Error("Primero debe existir una versión en borrador."), {
                    statusCode: 409,
                    code: "CLIP_VERSION_REQUIRED"
                });
            }
        }
        const nextStatus = input.decision === "APPROVE" ? "APPROVED" : "REJECTED";
        const metadata = {
            ...(clip.metadata || {}),
            privacyStatus: input.decision === "APPROVE"
                ? "CLEARED_BY_HUMAN"
                : clip.metadata?.privacyStatus || "PENDING_HUMAN_REVIEW",
            automaticPublishEligible: false,
            qualityScore: input.qualityScore,
            reviewNotes: input.notes || null,
            humanReviewedAt: new Date().toISOString()
        };
        const updateClip = await this.client.from("video_clips")
            .update({ status: nextStatus, metadata })
            .eq("id", clipId)
            .select("id,status,metadata")
            .single();
        if (updateClip.error) {
            throw new Error(`No se pudo revisar el clip: ${updateClip.error.message}`);
        }
        if (version) {
            const versionUpdate = await this.client.from("clip_versions")
                .update({ status: nextStatus, quality_score: input.qualityScore })
                .eq("id", version.id);
            if (versionUpdate.error) {
                throw new Error(`No se pudo revisar la versión: ${versionUpdate.error.message}`);
            }
            if (input.decision === "APPROVE") {
                const assetIds = [
                    version.media_asset_id,
                    version.cover_asset_id,
                    version.subtitle_asset_id
                ].filter(Boolean);
                if (assetIds.length) {
                    const assetUpdate = await this.client.from("media_assets")
                        .update({ privacy_status: "clear" })
                        .in("id", assetIds);
                    if (assetUpdate.error) {
                        throw new Error(`No se pudo confirmar la privacidad: ${assetUpdate.error.message}`);
                    }
                }
            }
        }
        const audit = await this.client.from("audit_logs").insert({
            actor_type: "human_admin",
            action: input.decision === "APPROVE" ? "CLIP_APPROVED" : "CLIP_REJECTED",
            entity_type: "video_clip",
            entity_id: clipId,
            before_data: { status: clip.status },
            after_data: { status: nextStatus, automaticPublishEligible: false }
        });
        if (audit.error) throw new Error(`No se pudo auditar la revisión: ${audit.error.message}`);
        return {
            id: updateClip.data.id,
            status: updateClip.data.status,
            privacyStatus: updateClip.data.metadata.privacyStatus,
            metadata: updateClip.data.metadata
        };
    }
}

module.exports = {
    VideoRepository
};
