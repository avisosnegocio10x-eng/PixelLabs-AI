const RANGE_PATTERN = /^bytes (\d+)-(\d+)\/(\d+)$/;

function parseContentRange(value) {
    const match = RANGE_PATTERN.exec(value || "");

    if (!match) {
        throw Object.assign(new Error("Content-Range inválido."), {
            statusCode: 400,
            code: "INVALID_CONTENT_RANGE"
        });
    }

    const start = Number(match[1]);
    const end = Number(match[2]);
    const total = Number(match[3]);

    if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        !Number.isSafeInteger(total) ||
        start < 0 ||
        end < start ||
        end >= total
    ) {
        throw Object.assign(new Error("El rango del fragmento no es válido."), {
            statusCode: 416,
            code: "UNSATISFIABLE_CONTENT_RANGE"
        });
    }

    return {
        start,
        end,
        total,
        length: end - start + 1
    };
}

function mergeRanges(ranges) {
    return [...ranges]
        .sort((a, b) => a.start - b.start)
        .reduce((merged, current) => {
            const previous = merged[merged.length - 1];

            if (!previous || current.start > previous.end + 1) {
                merged.push({ ...current });
            } else {
                previous.end = Math.max(previous.end, current.end);
            }

            return merged;
        }, []);
}

function coveredBytes(ranges) {
    return mergeRanges(ranges).reduce(
        (total, range) => total + range.end - range.start + 1,
        0
    );
}

function isComplete(ranges, totalBytes) {
    const merged = mergeRanges(ranges);
    return merged.length === 1 &&
        merged[0].start === 0 &&
        merged[0].end === totalBytes - 1;
}

module.exports = {
    parseContentRange,
    mergeRanges,
    coveredBytes,
    isComplete
};
