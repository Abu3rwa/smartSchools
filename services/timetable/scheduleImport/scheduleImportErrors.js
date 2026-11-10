export const scheduleImportError = (message, code, statusCode = 400) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    error.expose = statusCode < 500;
    return error;
};
