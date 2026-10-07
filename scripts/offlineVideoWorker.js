// Uses the existing video processor and source policy; never creates an API client.
const crypto = require("node:crypto");
const path = require("node:path");
const fs = require("node:fs/promises");
const { discoverLocalVideos, resolveLocalSource } = require("../src/contentEngine/video/localSourcePolicy");
const { LocalVideoProcessor } = require("../src/contentEngine/video/localVideoProcessor");
const { JsonDocumentStore } = require("../src/contentEngine/repositories/jsonDocumentStore");

async function processOfflineInbox(config, options = {}) {
    const store = options.store || new JsonDocumentStore(path.join(config.workRoot, "offline-jobs.json"), { jobs: {} });
    const processor = options.processor || new LocalVideoProcessor(config);
    const sources = await discoverLocalVideos(config.inboxRoot);
    let completed = 0;
    for (const source of sources) {
        if (options.signal?.aborted) break;
        // Avoid partially copied files. The normal processor validates size and checksum again.
        if (Date.now() - Date.parse(source.modifiedAt) < (options.stableMs ?? 10000)) continue;
        await resolveLocalSource(config.inboxRoot, source.relativePath);
        const key = crypto.createHash("sha256").update(JSON.stringify([
            source.relativePath, source.byteSize, source.modifiedAt
        ])).digest("hex");
        const previous = (await store.read()).jobs[key];
        if (previous?.status === "COMPLETED") continue;
        if (previous?.status === "FAILED" && Date.now() - Date.parse(previous.updatedAt) < 60000) continue;
        const job = { id: previous?.id || crypto.randomUUID(), attempt: (previous?.attempt || 0) + 1,
            payload: { source: { ...source, absolutePath: undefined } } };
        await store.update(data => { data.jobs[key] = { id: job.id, attempt: job.attempt, status: "RUNNING" }; });
        try {
            const result = await processor.process(job, { onProgress: options.onProgress });
            // Local paths are necessary to open these drafts on this PC. Nothing is uploaded.
            await fs.writeFile(path.join(config.workRoot, `${job.id}-draft.json`), JSON.stringify({
                ...result, status: "DRAFT", requiresHumanApproval: true, autoPublish: false, externalRequestsSent: 0
            }, null, 2));
            await store.update(data => { data.jobs[key] = { id: job.id, attempt: job.attempt,
                status: "COMPLETED", updatedAt: new Date().toISOString() }; });
            completed++;
        } catch (error) {
            await store.update(data => { data.jobs[key] = { id: job.id, attempt: job.attempt,
                status: "FAILED", errorCode: error.code || "LOCAL_VIDEO_FAILED", updatedAt: new Date().toISOString() }; });
            options.onError?.(error);
        }
    }
    return { completed, discovered: sources.length, externalRequestsSent: 0 };
}

async function runOfflineWorker(config, options = {}) {
    await fs.mkdir(config.inboxRoot, { recursive: true });
    await fs.mkdir(config.workRoot, { recursive: true });
    while (!options.signal?.aborted) {
        if (!options.paused?.()) await processOfflineInbox(config, options);
        await new Promise(resolve => {
            const timer = setTimeout(done, config.pollMs || 5000);
            function done() { clearTimeout(timer); options.signal?.removeEventListener("abort", done); resolve(); }
            options.signal?.addEventListener("abort", done, { once: true });
            if (options.signal?.aborted) done();
        });
    }
}
module.exports = { processOfflineInbox, runOfflineWorker };
