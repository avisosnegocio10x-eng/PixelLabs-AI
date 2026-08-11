const LOCAL_VIDEO_WORKFLOWS = Object.freeze([
    "video-processing",
    "clip-editing"
]);

function resolveExecutionTarget(type) {
    return LOCAL_VIDEO_WORKFLOWS.includes(type)
        ? "local-video"
        : "backend";
}

module.exports = {
    LOCAL_VIDEO_WORKFLOWS,
    resolveExecutionTarget
};
