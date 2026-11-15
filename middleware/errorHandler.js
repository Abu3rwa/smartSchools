import logger from '../utils/logger.js';

// Indexes whose collision means "someone else just created this", so a refresh
// and a retry is a real recovery path. Other duplicates keep the generic 400.
const KNOWN_DUPLICATE_INDEXES = [
    ['assignment', 'school', 'student'],
    ['number', 'project', 'school']
];

const isKnownDuplicate = (keyValue) => {
    const fields = Object.keys(keyValue || {}).sort();
    return KNOWN_DUPLICATE_INDEXES.some(
        (index) => index.length === fields.length && index.every((field, position) => field === fields[position])
    );
};

const mapKnownErrors = (err) => {
    if (err.name === 'CastError') {
        return { ...err, message: 'Resource not found', statusCode: 404 };
    }

    if (err.code === 11000) {
        const fields = Object.keys(err.keyValue || {});
        if (isKnownDuplicate(err.keyValue)) {
            return {
                ...err,
                code: 'DUPLICATE_RECORD',
                message: 'This was just created somewhere else. Refresh the page and try again.',
                statusCode: 409
            };
        }
        const summary = fields.length > 0 ? fields.join(', ') : 'value';
        return {
            ...err,
            message: `A record with this ${summary} combination already exists. Please use another value or check for an existing entry.`,
            statusCode: 400
        };
    }

    if (err.name === 'ValidationError') {
        return {
            ...err,
            message: Object.values(err.errors || {}).map((value) => value.message).join(', '),
            statusCode: 400
        };
    }

    if (err.name === 'JsonWebTokenError') {
        return { ...err, message: 'Invalid token', statusCode: 401 };
    }

    if (err.name === 'TokenExpiredError') {
        return { ...err, message: 'Token expired', statusCode: 401 };
    }

    return { ...err, message: err.message };
};

const buildErrorPayload = (error, originalError, statusCode) => {
    const payload = {
        success: false,
        // BE-035: Never leak raw internal error messages to clients for 500s
        message: statusCode >= 500 && error.expose !== true
            ? 'Internal server error'
            : (error.message || 'Server Error')
    };

    if (error.code) {
        payload.code = error.code;
    }
    if (Array.isArray(error.details) && error.details.length > 0) {
        payload.errors = error.details;
    }
    if (error.data !== undefined) {
        payload.data = error.data;
    }
    if (error.step) {
        payload.step = String(error.step);
    }
    if (error.reason) {
        payload.reason = String(error.reason);
    }
    if (process.env.NODE_ENV === 'development') {
        payload.stack = originalError.stack;
        if (statusCode >= 500) {
            payload.message = error.message || 'Server Error';
        }
    }

    return payload;
};

// Global error handler middleware
const errorHandler = (err, req, res, next) => {
    void next;
    const error = mapKnownErrors(err);
    const statusCode = error.statusCode || 500;

    // BE-030: Include correlation ID in error logs.
    // Expected client errors (4xx) are a normal response, not a fault, so they
    // must not raise ERROR-level stack traces in production logs.
    if (statusCode >= 500) {
        logger.error(err.message, { correlationId: req.correlationId, stack: err.stack });
    } else {
        logger.warn(err.message, {
            correlationId: req.correlationId,
            statusCode,
            method: req.method,
            path: req.originalUrl
        });
    }

    // Ensure CORS headers are present on error responses so the browser
    // doesn't mask the real error behind a misleading CORS failure.
    const origin = req.headers.origin;
    if (origin && !res.headersSent) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    const payload = buildErrorPayload(error, err, statusCode);
    if (req.correlationId) {
        payload.requestId = req.correlationId;
    }
    return res.status(statusCode).json(payload);
};

// Async handler wrapper to avoid try-catch blocks
export const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// Not found handler
export const notFound = (req, res, next) => {
    const error = new Error(`Not Found - ${req.originalUrl}`);
    // Without statusCode the handler below would report a missing route as a
    // 500 crash, hiding "this endpoint is not deployed" behind "Internal server error".
    error.statusCode = 404;
    next(error);
};

export default errorHandler;
