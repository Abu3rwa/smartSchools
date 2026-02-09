const timestamp = () => new Date().toISOString();

const logger = {
    error(msg, meta) {
        if (meta !== undefined) {
            console.error(`[${timestamp()}] error:`, msg, meta);
        } else {
            console.error(`[${timestamp()}] error:`, msg);
        }
    },
    info(msg, meta) {
        if (meta !== undefined) {
            console.log(`[${timestamp()}] info:`, msg, meta);
        } else {
            console.log(`[${timestamp()}] info:`, msg);
        }
    },
    warn(msg, meta) {
        if (meta !== undefined) {
            console.warn(`[${timestamp()}] warn:`, msg, meta);
        } else {
            console.warn(`[${timestamp()}] warn:`, msg);
        }
    }
};

export default logger;
