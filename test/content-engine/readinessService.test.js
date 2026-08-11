const test = require("node:test");
const assert = require("node:assert/strict");
const { checkSupabaseReadiness } = require("../../src/contentEngine/services/readinessService");

function fakeClient(options = {}) {
    return {
        from: table => ({
            select: () => ({
                eq: async () => ({
                    error: options[`${table}Error`] || null,
                    count: options[`${table}Count`] ?? 1
                })
            })
        }),
        storage: {
            getBucket: async () => ({
                data: options.bucket || { public: false },
                error: options.bucketError || null
            })
        }
    };
}

test("readiness comprueba configuración, catálogo y Storage privado", async () => {
    assert.deepEqual(await checkSupabaseReadiness({
        client: fakeClient(),
        bucket: "pixellabs-content"
    }), {
        databaseReachable: true,
        catalogReachable: true,
        storageReachable: true
    });
});

test("readiness rechaza un bucket público", async () => {
    await assert.rejects(
        () => checkSupabaseReadiness({
            client: fakeClient({ bucket: { public: true } }),
            bucket: "pixellabs-content"
        }),
        error => error.code === "PRIVATE_STORAGE_NOT_READY"
    );
});
