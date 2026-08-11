const test = require("node:test");
const assert = require("node:assert/strict");
const { VideoRepository } = require("../../src/contentEngine/repositories/videoRepository");

function queryBuilder(table, resolver, operations) {
    const state = { table, operation: "select", values: null, filters: [] };
    const builder = {
        select() { state.select = [...arguments]; return builder; },
        order() { return builder; },
        limit() { return builder; },
        eq(column, value) { state.filters.push(["eq", column, value]); return builder; },
        in(column, value) { state.filters.push(["in", column, value]); return builder; },
        contains(column, value) { state.filters.push(["contains", column, value]); return builder; },
        is(column, value) { state.filters.push(["is", column, value]); return builder; },
        maybeSingle() { state.mode = "maybeSingle"; return builder; },
        single() { state.mode = "single"; return builder; },
        update(values) { state.operation = "update"; state.values = values; operations.push(state); return builder; },
        upsert(values) { state.operation = "upsert"; state.values = values; operations.push(state); return builder; },
        insert(values) { state.operation = "insert"; state.values = values; operations.push(state); return builder; },
        delete() { state.operation = "delete"; operations.push(state); return builder; },
        then(resolve, reject) {
            return Promise.resolve(resolver(state)).then(resolve, reject);
        }
    };
    return builder;
}

test("la biblioteca de Supabase entrega clips privados con URLs temporales", async () => {
    const clipId = "11111111-1111-4111-8111-111111111111";
    const sourceId = "22222222-2222-4222-8222-222222222222";
    const mediaId = "33333333-3333-4333-8333-333333333333";
    const coverId = "44444444-4444-4444-8444-444444444444";
    const operations = [];
    const resolver = state => {
        if (state.table === "video_clips") return { data: [{
            id: clipId,
            source_video_id: sourceId,
            start_ms: 0,
            end_ms: 15000,
            duration_ms: 15000,
            topic: "Proceso real",
            hook: null,
            on_screen_text: null,
            caption: null,
            recommended_platforms: ["instagram", "tiktok"],
            score: 90,
            status: "DRAFT",
            fingerprint: "fixture",
            metadata: { privacyStatus: "PENDING_HUMAN_REVIEW" },
            created_at: "2026-08-10T00:00:00Z",
            updated_at: "2026-08-10T00:00:00Z"
        }], error: null };
        if (state.table === "source_videos") return { data: [{
            id: sourceId,
            upload_id: "local-job",
            original_filename: "largo.mp4"
        }], error: null };
        if (state.table === "clip_versions") return { data: [{
            id: "55555555-5555-4555-8555-555555555555",
            video_clip_id: clipId,
            version: 1,
            style: "process-real",
            platform: null,
            media_asset_id: mediaId,
            subtitle_asset_id: null,
            cover_asset_id: coverId,
            quality_score: null,
            status: "DRAFT",
            render_settings: { automaticPublishEligible: false },
            created_at: "2026-08-10T00:00:00Z"
        }], error: null };
        if (state.table === "media_assets") return { data: [{
            id: mediaId,
            storage_bucket: "pixellabs-content",
            storage_path: "local-worker/job/clip.mp4",
            original_filename: "clip.mp4",
            mime_type: "video/mp4",
            byte_size: 1000,
            privacy_status: "unchecked"
        }, {
            id: coverId,
            storage_bucket: "pixellabs-content",
            storage_path: "local-worker/job/cover.jpg",
            original_filename: "cover.jpg",
            mime_type: "image/jpeg",
            byte_size: 100,
            privacy_status: "unchecked"
        }], error: null };
        return { data: [], error: null };
    };
    const client = {
        from: table => queryBuilder(table, resolver, operations),
        storage: {
            from: bucket => ({
                createSignedUrl: async storagePath => ({
                    data: { signedUrl: `https://signed.example/${bucket}/${storagePath}` },
                    error: null
                })
            })
        }
    };
    const clips = await new VideoRepository(client).listRemoteClips({ platform: "instagram" });
    assert.equal(clips.length, 1);
    assert.equal(clips[0].originalFilename, "largo.mp4");
    assert.equal(clips[0].versions[0].media.expiresInSeconds, 900);
    assert.match(clips[0].versions[0].media.signedUrl, /^https:\/\/signed\.example\//);
    assert.equal(JSON.stringify(clips).includes("service_role"), false);
});

test("reutiliza un artefacto por checksum y limpia la copia redundante", async () => {
    const removed = [];
    const operations = [];
    const resolver = state => {
        if (state.table === "media_assets" && state.operation === "select") {
            return {
                data: {
                    id: "33333333-3333-4333-8333-333333333333",
                    storage_bucket: "pixellabs-content",
                    storage_path: "local-worker/old/clip.mp4",
                    byte_size: 1000,
                    mime_type: "video/mp4"
                },
                error: null
            };
        }
        return { data: null, error: null };
    };
    const client = {
        from: table => queryBuilder(table, resolver, operations),
        storage: {
            from: () => ({
                remove: async paths => { removed.push(...paths); return { data: {}, error: null }; }
            })
        }
    };
    const id = await new VideoRepository(client).persistRemoteArtifact(
        { id: "11111111-1111-4111-8111-111111111111" },
        {
            artifactType: "clip-video",
            storagePath: "local-worker/new/clip.mp4",
            filename: "clip.mp4",
            contentType: "video/mp4",
            byteSize: 1000,
            checksumSha256: "a".repeat(64)
        },
        "worker-test",
        "pixellabs-content"
    );
    assert.equal(id, "33333333-3333-4333-8333-333333333333");
    assert.deepEqual(removed, ["local-worker/new/clip.mp4"]);
});

test("la revisión remota exige privacidad y conserva publicación apagada", async () => {
    const clipId = "11111111-1111-4111-8111-111111111111";
    const versionId = "55555555-5555-4555-8555-555555555555";
    const operations = [];
    const resolver = state => {
        if (state.table === "video_clips" && state.operation === "select") {
            return { data: { id: clipId, status: "DRAFT", metadata: {} }, error: null };
        }
        if (state.table === "clip_versions" && state.operation === "select") {
            return { data: [{
                id: versionId,
                version: 1,
                status: "DRAFT",
                media_asset_id: "33333333-3333-4333-8333-333333333333",
                cover_asset_id: null,
                subtitle_asset_id: null
            }], error: null };
        }
        if (state.table === "video_clips" && state.operation === "update") {
            return { data: { id: clipId, status: state.values.status, metadata: state.values.metadata }, error: null };
        }
        return { data: null, error: null };
    };
    const client = {
        from: table => queryBuilder(table, resolver, operations),
        storage: { from: () => ({}) }
    };
    const repository = new VideoRepository(client);
    await assert.rejects(
        () => repository.reviewRemoteClip(clipId, {
            decision: "APPROVE",
            privacyCleared: false,
            qualityScore: 95
        }),
        error => error.code === "CLIP_PRIVACY_NOT_CLEARED"
    );
    const approved = await repository.reviewRemoteClip(clipId, {
        decision: "APPROVE",
        privacyCleared: true,
        qualityScore: 95,
        notes: "Revisión humana"
    });
    assert.equal(approved.status, "APPROVED");
    assert.equal(approved.privacyStatus, "CLEARED_BY_HUMAN");
    assert.equal(approved.metadata.automaticPublishEligible, false);
    const audit = operations.find(operation => operation.table === "audit_logs");
    assert.equal(audit.values.after_data.automaticPublishEligible, false);
});
