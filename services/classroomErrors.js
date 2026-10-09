export class ClassroomSyncError extends Error {
    constructor(code, message, { retryable = false, status = null } = {}) {
        super(message);
        this.name = 'ClassroomSyncError';
        this.code = code;
        this.retryable = retryable;
        this.status = status;
    }
}

const messageFor = (code) => ({
    PERMISSION_DENIED: 'Google Classroom denied this action. Make sure you teach this course and that this assignment was created from this app.',
    COURSE_NOT_FOUND: 'The mapped Google Classroom course or assignment could not be found. Re-map the course and try again.',
    RATE_LIMITED: 'Google Classroom is limiting requests right now. Please try again shortly.',
    API_DISABLED: 'The Google Classroom API is not enabled for this application.',
    INVALID_REQUEST: 'Google Classroom rejected the assignment details. Check the title, due date and points.',
    UNAVAILABLE: 'Google Classroom is temporarily unavailable. Please try again.',
    UNKNOWN: 'Google Classroom request failed. Please try again.'
}[code]);

const readReason = (error) => {
    const data = error?.response?.data;
    const reason = data?.error?.errors?.[0]?.reason
        || data?.error?.details?.[0]?.reason
        || data?.error?.status
        || data?.error;
    return typeof reason === 'string' ? reason : '';
};

/**
 * Converts a googleapis error into a ClassroomSyncError with a safe, user-facing message.
 * The raw Google response is never copied into the message.
 */
export const normalizeGoogleError = (error) => {
    if (error instanceof ClassroomSyncError) return error;

    const status = Number(error?.response?.status || error?.status || error?.code) || null;
    const reason = readReason(error);
    const rawMessage = String(error?.message || '');

    if (/invalid_grant/i.test(reason) || /invalid_grant/i.test(rawMessage) || status === 401) {
        return new ClassroomSyncError(
            'AUTH_REVOKED',
            'Google Classroom access was revoked or expired. Please reconnect your account.',
            { status }
        );
    }
    if (status === 403 && /accessNotConfigured|SERVICE_DISABLED|has not been used|is disabled/i.test(`${reason} ${rawMessage}`)) {
        return new ClassroomSyncError('API_DISABLED', messageFor('API_DISABLED'), { status });
    }
    if (status === 403 && /quota|rate.?limit/i.test(`${reason} ${rawMessage}`)) {
        return new ClassroomSyncError('RATE_LIMITED', messageFor('RATE_LIMITED'), { status, retryable: true });
    }
    if (status === 403) {
        return new ClassroomSyncError('PERMISSION_DENIED', messageFor('PERMISSION_DENIED'), { status });
    }
    if (status === 404) {
        return new ClassroomSyncError('COURSE_NOT_FOUND', messageFor('COURSE_NOT_FOUND'), { status });
    }
    if (status === 429) {
        return new ClassroomSyncError('RATE_LIMITED', messageFor('RATE_LIMITED'), { status, retryable: true });
    }
    if (status === 400) {
        return new ClassroomSyncError('INVALID_REQUEST', messageFor('INVALID_REQUEST'), { status });
    }
    if (status && status >= 500) {
        return new ClassroomSyncError('UNAVAILABLE', messageFor('UNAVAILABLE'), { status, retryable: true });
    }
    return new ClassroomSyncError('UNKNOWN', messageFor('UNKNOWN'), { status, retryable: true });
};

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retries rate-limited calls with exponential backoff. Server errors are only retried for
 * idempotent calls: a repeated create after an ambiguous failure could duplicate coursework.
 */
export const withRetry = async (operation, { idempotent = false, attempts = 3, baseDelayMs = 500, sleep = defaultSleep } = {}) => {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            return await operation();
        } catch (error) {
            const normalized = normalizeGoogleError(error);
            lastError = normalized;
            const canRetry = normalized.code === 'RATE_LIMITED'
                || (idempotent && normalized.code === 'UNAVAILABLE');
            if (!canRetry || attempt === attempts) throw normalized;
            await sleep(baseDelayMs * 2 ** (attempt - 1));
        }
    }
    throw lastError;
};
