/**
 * Response contracts for the public landing endpoints.
 *
 * These helpers are intentionally free of axios, React, i18n and network
 * access so they can be unit tested directly. A malformed response is never
 * reported as an empty successful one: malformed means failure.
 */

export const LANDING_ERROR_CODES = {
    unavailable: 'unavailable',
    invalidResponse: 'invalidResponse',
    cancelled: 'cancelled',
};

export const createLandingServiceError = (code, message, details = {}) => {
    const error = new Error(message);
    error.code = code;
    error.status = details.status ?? null;
    error.serverErrors = Array.isArray(details.serverErrors) ? details.serverErrors : [];
    error.retryAfter = details.retryAfter ?? null;
    if (details.cause) error.cause = details.cause;
    return error;
};

const isSuccessEnvelope = (payload) => Boolean(payload) && payload.success === true;

const invalidResponse = (message) =>
    createLandingServiceError(LANDING_ERROR_CODES.invalidResponse, message);

export const parseLandingPlansPayload = (payload) => {
    if (!isSuccessEnvelope(payload)) {
        throw invalidResponse('Landing plans response is not a success envelope.');
    }
    const plans = payload?.data?.plans;
    if (!Array.isArray(plans)) {
        throw invalidResponse('Landing plans response has no plan array.');
    }
    return plans;
};

export const parseLandingSchoolsPayload = (payload) => {
    if (!isSuccessEnvelope(payload)) {
        throw invalidResponse('School search response is not a success envelope.');
    }
    const schools = payload?.data?.schools;
    if (!Array.isArray(schools)) {
        throw invalidResponse('School search response has no school array.');
    }

    const rows = schools.map((row) => {
        if (!row || typeof row !== 'object') {
            throw invalidResponse('School search response contains an invalid row.');
        }
        const { name, slug } = row;
        if (typeof name !== 'string' || !name.trim()) {
            throw invalidResponse('School search response contains a row without a name.');
        }
        if (typeof slug !== 'string' || !slug.trim()) {
            throw invalidResponse('School search response contains a row without a slug.');
        }
        return { name, slug };
    });

    const hasMore = payload?.data?.hasMore;
    if (typeof hasMore !== 'boolean') {
        throw invalidResponse('School search response has no boolean hasMore flag.');
    }

    return { schools: rows, hasMore };
};

export const parseDemoRequestPayload = (payload) => {
    if (!isSuccessEnvelope(payload)) {
        throw invalidResponse('Demo request response is not a success envelope.');
    }
    const id = payload?.data?.id;
    if (typeof id !== 'string' || !id.trim()) {
        throw invalidResponse('Demo request response has no confirmation id.');
    }
    return { id };
};

const readRetryAfter = (headers) => {
    const value = headers?.['retry-after'] ?? headers?.['Retry-After'];
    if (typeof value !== 'string') return null;
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.floor(seconds);
    const parsedDate = Date.parse(value);
    if (Number.isNaN(parsedDate)) return null;
    return Math.max(0, Math.ceil((parsedDate - Date.now()) / 1000));
};

export const toLandingServiceError = (error) => {
    if (error?.code && Object.values(LANDING_ERROR_CODES).includes(error.code)) {
        return error;
    }

    if (error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError' || error?.code === 'ABORT_ERR') {
        return createLandingServiceError(LANDING_ERROR_CODES.cancelled, 'Request cancelled.', { cause: error });
    }

    return createLandingServiceError(LANDING_ERROR_CODES.unavailable, 'Landing request failed.', {
        status: error?.response?.status ?? null,
        serverErrors: error?.response?.data?.errors,
        retryAfter: readRetryAfter(error?.response?.headers),
        cause: error,
    });
};
