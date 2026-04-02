import logger from '../utils/logger.js';

const mapKnownErrors = (err) => {
    if (err.name === 'CastError') {
        return { ...err, message: 'Resource not found', statusCode: 404 };
    }

    if (err.code === 11000) {
        const field = Object.keys(err.keyValue || {})[0] || 'value';
        return {
            ...err,
            message: `Duplicate field value: ${field}. Please use another value`,
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

const buildErrorPayload = (error, originalError) => {
    const payload = {
        success: false,
        message: error.message || 'Server Error'
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
    if (process.env.NODE_ENV === 'development') {
        payload.stack = originalError.stack;
    }

    return payload;
};

// Global error handler middleware
const errorHandler = (err, req, res, next) => {
    void next;
    logger.error(err.message, err);

    // Ensure CORS headers are present on error responses so the browser
    // doesn't mask the real error behind a misleading CORS failure.
    const origin = req.headers.origin;
    if (origin && !res.headersSent) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    const error = mapKnownErrors(err);
    const statusCode = error.statusCode || 500;
    const payload = buildErrorPayload(error, err);
    return res.status(statusCode).json(payload);
};

// Async handler wrapper to avoid try-catch blocks
export const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// Not found handler
export const notFound = (req, res, next) => {
    const error = new Error(`Not Found - ${req.originalUrl}`);
    res.status(404);
    next(error);
};

export default errorHandler;
