const fs = require("fs/promises");
const path = require("path");

const writeQueues = new Map();

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

class JsonDocumentStore {
    constructor(filePath, defaults) {
        this.filePath = path.resolve(filePath);
        this.defaults = clone(defaults);
    }

    async read() {
        try {
            return JSON.parse(await fs.readFile(this.filePath, "utf8"));
        } catch (error) {
            if (error.code !== "ENOENT") throw error;
            return clone(this.defaults);
        }
    }

    async write(document) {
        await fs.mkdir(path.dirname(this.filePath), { recursive: true });
        const temporaryPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
        await fs.writeFile(temporaryPath, JSON.stringify(document, null, 2));
        await fs.rename(temporaryPath, this.filePath);
        return clone(document);
    }

    async update(mutator) {
        const previous = writeQueues.get(this.filePath) || Promise.resolve();
        const operation = previous.then(async () => {
            const document = await this.read();
            const result = await mutator(document);
            const nextDocument = result === undefined ? document : result;
            return this.write(nextDocument);
        });

        writeQueues.set(this.filePath, operation.catch(() => undefined));
        return operation;
    }
}

module.exports = {
    JsonDocumentStore,
    clone
};
