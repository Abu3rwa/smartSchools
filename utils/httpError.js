export const createHttpError = ({
    statusCode = 500,
    message = 'Server Error',
    code = null,
    details = null,
    data = undefined
} = {}) => {
    const error = new Error(message);
    error.statusCode = statusCode;

    if (code) {
        error.code = code;
    }
    if (Array.isArray(details) && details.length > 0) {
        error.details = details;
    }
    if (data !== undefined) {
        error.data = data;
    }

    return error;
};
