const fs = require("fs/promises");
const path = require("path");

const LOCAL_VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".mkv", ".webm"]);
const LOCAL_VIDEO_MIME_TYPES = Object.freeze({
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".m4v": "video/x-m4v",
    ".mkv": "video/x-matroska",
    ".webm": "video/webm"
});

function normalizeRelativePath(value) {
    const normalized = String(value || "").replace(/\\/g, "/");
    if (
        !normalized ||
        normalized.startsWith("/") ||
        normalized.split("/").includes("..")
    ) {
        throw Object.assign(new Error("Ruta local inválida."), {
            code: "INVALID_LOCAL_SOURCE_PATH"
        });
    }
    return normalized;
}

async function resolveLocalSource(inboxRoot, relativePath) {
    const normalized = normalizeRelativePath(relativePath);
    const root = await fs.realpath(path.resolve(inboxRoot));
    const candidate = path.resolve(root, ...normalized.split("/"));
    const realCandidate = await fs.realpath(candidate);
    const withinRoot = realCandidate === root || realCandidate.startsWith(`${root}${path.sep}`);
    if (!withinRoot) {
        throw Object.assign(new Error("La fuente está fuera de la bandeja local."), {
            code: "LOCAL_SOURCE_OUTSIDE_INBOX"
        });
    }
    const [entry, realEntry] = await Promise.all([
        fs.lstat(candidate),
        fs.stat(realCandidate)
    ]);
    if (entry.isSymbolicLink() || !realEntry.isFile()) {
        throw Object.assign(new Error("La fuente debe ser un archivo regular."), {
            code: "LOCAL_SOURCE_NOT_REGULAR_FILE"
        });
    }
    if (!LOCAL_VIDEO_EXTENSIONS.has(path.extname(realCandidate).toLowerCase())) {
        throw Object.assign(new Error("Formato de video local no permitido."), {
            code: "LOCAL_SOURCE_FORMAT_NOT_ALLOWED"
        });
    }
    return {
        path: realCandidate,
        relativePath: normalized,
        stat: realEntry
    };
}

async function discoverLocalVideos(inboxRoot) {
    const root = path.resolve(inboxRoot);
    await fs.mkdir(root, { recursive: true });
    const rootReal = await fs.realpath(root);
    const found = [];

    async function visit(directory, prefix = "") {
        const entries = await fs.readdir(directory, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isSymbolicLink()) continue;
            const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
            const absolute = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                await visit(absolute, relative);
                continue;
            }
            if (!entry.isFile() || !LOCAL_VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
                continue;
            }
            const stat = await fs.stat(absolute);
            found.push({
                relativePath: normalizeRelativePath(relative),
                filename: entry.name,
                byteSize: stat.size,
                mimeType: LOCAL_VIDEO_MIME_TYPES[path.extname(entry.name).toLowerCase()],
                modifiedAt: stat.mtime.toISOString(),
                absolutePath: path.join(rootReal, ...relative.split("/"))
            });
        }
    }

    await visit(rootReal);
    return found.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

module.exports = {
    LOCAL_VIDEO_EXTENSIONS,
    LOCAL_VIDEO_MIME_TYPES,
    normalizeRelativePath,
    resolveLocalSource,
    discoverLocalVideos
};
