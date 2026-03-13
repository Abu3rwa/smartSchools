import { AUTH_CALLBACK_QUERY_KEYS } from '../constants';

const getHashParams = () => {
    return new URLSearchParams(window.location.hash.replace(/^#/, ''));
};

export const getAuthCallbackParams = (searchParams) => {
    const hashParams = getHashParams();

    return {
        token:
            hashParams.get(AUTH_CALLBACK_QUERY_KEYS.token) ||
            searchParams.get(AUTH_CALLBACK_QUERY_KEYS.token),
        isNew:
            hashParams.get(AUTH_CALLBACK_QUERY_KEYS.isNew) ||
            searchParams.get(AUTH_CALLBACK_QUERY_KEYS.isNew),
        error:
            hashParams.get(AUTH_CALLBACK_QUERY_KEYS.error) ||
            searchParams.get(AUTH_CALLBACK_QUERY_KEYS.error)
    };
};

export const getLoginErrorRedirectPath = (error, fallbackError = 'Authentication failed') => {
    const errorMessage =
        typeof error === 'string'
            ? error
            : error?.message || String(error || fallbackError);

    return `/login?error=${encodeURIComponent(errorMessage)}`;
};
