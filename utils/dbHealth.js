/**
 * Atlas outages reach the app as raw driver errors: server selection fails,
 * DNS lookups never resolve a shard, or a socket is reset mid-query. They are
 * not a bug and not the caller's fault, so they are answered with 503 and
 * logged once per window instead of once per request and once per job tick.
 */
const NETWORK_ERROR_CODES = new Set([
    'ENOTFOUND',
    'EAI_AGAIN',
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'EPIPE',
    'EHOSTUNREACH',
    'ENETUNREACH',
]);

const CONNECTIVITY_ERROR_NAMES = new Set([
    'MongoServerSelectionError',
    'MongoNetworkError',
    'MongoNetworkTimeoutError',
    'MongoTopologyClosedError',
    'MongoNotConnectedError',
]);

const UNAVAILABLE_PATTERN = /getaddrinfo (eai_again|enotfound)|server selection timed out|topology is closed/i;

export const DB_UNAVAILABLE_MESSAGE = 'The database is temporarily unreachable. Try again in a moment.';
export const DB_RETRY_AFTER_SECONDS = 15;

export const isDbUnavailable = (error, depth = 0) => {
    if (!error || typeof error !== 'object' || depth > 2) return false;
    if (CONNECTIVITY_ERROR_NAMES.has(error.name)) return true;
    if (typeof error.code === 'string' && NETWORK_ERROR_CODES.has(error.code)) return true;
    if (typeof error.message === 'string' && UNAVAILABLE_PATTERN.test(error.message)) return true;
    return isDbUnavailable(error.cause, depth + 1);
};

export const dbUnavailableError = () => {
    const error = new Error(DB_UNAVAILABLE_MESSAGE);
    error.statusCode = 503;
    error.code = 'DB_UNAVAILABLE';
    error.expose = true;
    error.retryAfter = DB_RETRY_AFTER_SECONDS;
    return error;
};

const OUTAGE_LOG_INTERVAL_MS = 5 * 60 * 1000;
let lastOutageLogAt = 0;

export const shouldLogDbOutage = (now = Date.now()) => {
    if (now - lastOutageLogAt < OUTAGE_LOG_INTERVAL_MS) return false;
    lastOutageLogAt = now;
    return true;
};

export const resetDbOutageLogState = () => {
    lastOutageLogAt = 0;
};
