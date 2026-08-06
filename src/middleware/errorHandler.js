function notFoundHandler(req, res) {
    res.status(404).json({
        ok: false,
        error: "NOT_FOUND"
    });
}

function errorHandler(error, req, res, next) {
    if (res.headersSent) {
        return next(error);
    }

    console.error("Unhandled request error", {
        method: req.method,
        path: req.path,
        message: error.message
    });

    res.status(error.statusCode || 500).json({
        ok: false,
        error: error.code || "INTERNAL_ERROR",
        message: process.env.NODE_ENV === "production"
            ? "Ocurrió un error interno."
            : error.message
    });
}

module.exports = {
    notFoundHandler,
    errorHandler
};
