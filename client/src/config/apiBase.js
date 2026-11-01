/**
 * API origin resolution shared by axios and by media URLs.
 *
 * In production the client is hosted separately from the API, so a relative
 * "/api/..." URL would hit the client host and 404. Everything that builds a
 * link to our own API must go through this module.
 */
const env = import.meta.env ?? {};

const PROD_FALLBACK_API_URL = env.VITE_PROD_API_URL || 'https://schoolworkso.onrender.com/api';

const isLocalLikeUrl = (value = '') => /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(String(value));

const resolveApiUrl = () => {
    const envApiUrl = env.VITE_API_URL;

    if (env.PROD) {
        if (envApiUrl && !isLocalLikeUrl(envApiUrl)) {
            if (envApiUrl.startsWith('http') && !envApiUrl.endsWith('/api') && !envApiUrl.includes('/api/')) {
                return `${envApiUrl.replace(/\/+$/, '')}/api`;
            }
            return envApiUrl;
        }
        return PROD_FALLBACK_API_URL;
    }

    if (envApiUrl) return envApiUrl;

    if (typeof window !== 'undefined' && isLocalLikeUrl(window.location.hostname)) {
        return 'http://localhost:5000/api';
    }
    return '/api';
};

export const API_URL = resolveApiUrl();
export const API_ORIGIN = API_URL.replace(/\/api\/?$/, '');

/** Makes a server-relative API path absolute so audio can load from the API host. */
export const toApiUrl = (url) => (typeof url === 'string' && url.startsWith('/') ? `${API_ORIGIN}${url}` : url);
