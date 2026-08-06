const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

async function probeVideo(filePath) {
    try {
        const { stdout } = await execFileAsync("ffprobe", [
            "-v", "error",
            "-show_entries", "format=duration,format_name:stream=index,codec_type,codec_name,width,height",
            "-of", "json",
            filePath
        ], {
            maxBuffer: 1024 * 1024,
            timeout: 60_000
        });

        const result = JSON.parse(stdout);
        const videoStream = result.streams?.find(stream => stream.codec_type === "video");

        if (!videoStream) {
            throw new Error("El archivo no contiene una pista de video.");
        }

        return {
            durationMs: Math.round(Number(result.format?.duration || 0) * 1000),
            format: result.format?.format_name || null,
            codec: videoStream.codec_name || null,
            width: videoStream.width || null,
            height: videoStream.height || null
        };
    } catch (error) {
        throw Object.assign(new Error(`Video inválido o dañado: ${error.message}`), {
            statusCode: 422,
            code: "INVALID_VIDEO"
        });
    }
}

module.exports = {
    probeVideo
};
