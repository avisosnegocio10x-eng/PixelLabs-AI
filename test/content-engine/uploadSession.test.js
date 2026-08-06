const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const {
    UploadSessionService,
    sanitizeFilename
} = require("../../src/contentEngine/video/uploadSessionService");

async function createFixture(options = {}) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pixellabs-upload-"));
    const repository = { upsert: async () => null };
    const service = new UploadSessionService({
        root,
        maxUploadBytes: options.maxUploadBytes || 1024,
        maxChunkBytes: options.maxChunkBytes || 8,
        repository,
        probe: options.probe || (async () => ({
            durationMs: 3_600_000,
            format: "mp4",
            codec: "h264",
            width: 1080,
            height: 1920
        })),
        checksum: options.checksum || (async () => "checksum")
    });

    return {
        root,
        service,
        cleanup: () => fs.rm(root, { recursive: true, force: true })
    };
}

test("sanea nombres sin permitir rutas externas", () => {
    assert.equal(sanitizeFilename("../../video prueba.mp4"), "video prueba.mp4");
});

test("recibe fragmentos fuera de orden, permite reanudar y completa", async t => {
    const fixture = await createFixture();
    t.after(fixture.cleanup);

    const upload = await fixture.service.create({
        filename: "impresion.mp4",
        totalBytes: 6,
        mimeType: "video/mp4"
    });

    await fixture.service.writeChunk(
        upload.uploadId,
        "bytes 3-5/6",
        Buffer.from("def")
    );
    let progress = await fixture.service.get(upload.uploadId);
    assert.equal(progress.receivedBytes, 3);

    await fixture.service.writeChunk(
        upload.uploadId,
        "bytes 0-2/6",
        Buffer.from("abc")
    );
    progress = await fixture.service.get(upload.uploadId);
    assert.equal(progress.progress, 100);

    const completed = await fixture.service.complete(upload.uploadId);
    assert.equal(completed.status, "QUEUED");
    assert.equal(completed.media.durationMs, 3_600_000);
    assert.equal(await fs.readFile(completed.filePath, "utf8"), "abcdef");
});

test("no completa una subida con fragmentos faltantes", async t => {
    const fixture = await createFixture();
    t.after(fixture.cleanup);
    const upload = await fixture.service.create({
        filename: "proceso.mov",
        totalBytes: 10,
        mimeType: "video/quicktime"
    });

    await fixture.service.writeChunk(
        upload.uploadId,
        "bytes 0-4/10",
        Buffer.from("12345")
    );

    await assert.rejects(
        () => fixture.service.complete(upload.uploadId),
        /faltan fragmentos/
    );
});

test("rechaza videos demasiado grandes antes de escribirlos", async t => {
    const fixture = await createFixture({ maxUploadBytes: 5 });
    t.after(fixture.cleanup);

    await assert.rejects(
        () => fixture.service.create({
            filename: "largo.mp4",
            totalBytes: 6,
            mimeType: "video/mp4"
        }),
        /supera el límite/
    );
});

test("marca como fallido un archivo que no supera la validación", async t => {
    const fixture = await createFixture({
        probe: async () => {
            throw Object.assign(new Error("archivo dañado"), { code: "INVALID_VIDEO" });
        }
    });
    t.after(fixture.cleanup);
    const upload = await fixture.service.create({
        filename: "dañado.webm",
        totalBytes: 3,
        mimeType: "video/webm"
    });

    await fixture.service.writeChunk(
        upload.uploadId,
        "bytes 0-2/3",
        Buffer.from("bad")
    );

    await assert.rejects(
        () => fixture.service.complete(upload.uploadId),
        /archivo dañado/
    );
    assert.equal((await fixture.service.get(upload.uploadId)).status, "FAILED");
});
