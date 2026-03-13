export const createHttpError = (statusCode, message, options = {}) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    if (options.code) {
        error.code = options.code;
    }
    if (options.details) {
        error.details = options.details;
    }
    return error;
};

export const assertCondition = (condition, statusCode, message, options = {}) => {
    if (!condition) {
        throw createHttpError(statusCode, message, options);
    }
};
