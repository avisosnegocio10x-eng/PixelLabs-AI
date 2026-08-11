const { VideoRepository } = require("../repositories/videoRepository");

class CloudVideoLibraryService {
    constructor(options = {}) {
        this.repository = options.repository || new VideoRepository(options.client);
    }

    listVideos() {
        return this.repository.listRemoteVideos();
    }

    listClips(filters = {}) {
        return this.repository.listRemoteClips(filters);
    }

    review(uploadId, clipId, input) {
        return this.repository.reviewRemoteClip(clipId, input);
    }
}

module.exports = {
    CloudVideoLibraryService
};
