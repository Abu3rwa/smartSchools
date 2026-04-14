import axios from 'axios';
import toast from 'react-hot-toast';

const PROD_FALLBACK_API_URL = import.meta.env.VITE_PROD_API_URL || 'https://schoolworkso.onrender.com/api';

const isLocalLikeUrl = (value = '') => /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(String(value));

const resolveApiUrl = () => {
    const envApiUrl = import.meta.env.VITE_API_URL;
    
    if (import.meta.env.PROD) {
        if (envApiUrl && !isLocalLikeUrl(envApiUrl)) {
            // Ensure absolute URLs have /api if they don't already
            if (envApiUrl.startsWith('http') && !envApiUrl.endsWith('/api') && !envApiUrl.includes('/api/')) {
                return `${envApiUrl.replace(/\/+$/, '')}/api`;
            }
            return envApiUrl;
        }
        return PROD_FALLBACK_API_URL;
    }

    if (envApiUrl) return envApiUrl;
    
    // Default to /api for same-origin or localhost:5000/api
    if (typeof window !== 'undefined' && isLocalLikeUrl(window.location.hostname)) {
        return 'http://localhost:5000/api';
    }
    return '/api';
};

const API_URL = resolveApiUrl();

// Create axios instance
const api = axios.create({
    baseURL: API_URL,
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json'
    }
});

let isRefreshing = false;
let refreshSubscribers = [];

const TOAST_COOLDOWN_MS = {
    permission: 15000,
    rateLimit: 30000,
    server: 20000,
    timeout: 20000,
    network: 45000
};

const lastToastAt = new Map();

const shouldShowToast = (key, cooldownMs) => {
    const now = Date.now();
    const lastShown = lastToastAt.get(key) || 0;
    if (now - lastShown < cooldownMs) return false;
    lastToastAt.set(key, now);
    return true;
};

const showRateLimitedErrorToast = (key, message, cooldownMs, id) => {
    if (!shouldShowToast(key, cooldownMs)) return;
    toast.error(message, id ? { id } : undefined);
};

const isSilentBackgroundRequest = (requestUrl = '') => {
    const url = String(requestUrl || '');
    return url.includes('/behavior/events') || url.includes('/behavior/sessions/');
};

const subscribeTokenRefresh = (callback) => {
    refreshSubscribers.push(callback);
};

const onRefreshed = (nextToken) => {
    refreshSubscribers.forEach((callback) => callback(nextToken));
    refreshSubscribers = [];
};

const clearAuthStorage = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
};

// Request interceptor - add auth token
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        const behaviorSessionId = localStorage.getItem('behavior_session_id');
        const currentAcademicYear = localStorage.getItem('currentAcademicYear');
        const requestUrl = config.url || '';
        const isAuthRequest = requestUrl.startsWith('/auth/') || requestUrl.includes('/auth/');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        if (behaviorSessionId) {
            config.headers['x-session-id'] = behaviorSessionId;
        }
        if (currentAcademicYear && !isAuthRequest) {
            config.headers['x-academic-year'] = currentAcademicYear;
        } else if (isAuthRequest && config.headers['x-academic-year']) {
            delete config.headers['x-academic-year'];
        }
        const selectedSemester = localStorage.getItem('selectedSemester');
        if (selectedSemester && selectedSemester !== 'null' && !isAuthRequest) {
            config.headers['x-academic-semester'] = selectedSemester;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor - handle errors
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config || {};
        const status = error.response?.status;
        const requestUrl = String(originalRequest.url || '');

        // Ignore canceled requests and telemetry requests to avoid noisy UX.
        if (error.code === 'ERR_CANCELED' || isSilentBackgroundRequest(requestUrl)) {
            return Promise.reject(error);
        }

        if (status === 401 && !requestUrl.includes('/auth/refresh') && !originalRequest._retry) {
            const refreshToken = localStorage.getItem('refreshToken');
            if (!refreshToken) {
                clearAuthStorage();
                window.location.href = '/login';
                return Promise.reject(error);
            }

            if (isRefreshing) {
                return new Promise((resolve, reject) => {
                    subscribeTokenRefresh((nextToken) => {
                        if (!nextToken) {
                            reject(error);
                            return;
                        }
                        originalRequest.headers = originalRequest.headers || {};
                        originalRequest.headers.Authorization = `Bearer ${nextToken}`;
                        resolve(api(originalRequest));
                    });
                });
            }

            originalRequest._retry = true;
            isRefreshing = true;

            try {
                const refreshResponse = await axios.post(
                    `${API_URL}/auth/refresh`,
                    { refreshToken },
                    { headers: { 'Content-Type': 'application/json' } }
                );

                const nextToken = refreshResponse?.data?.data?.token;
                const nextRefreshToken = refreshResponse?.data?.data?.refreshToken;
                if (!nextToken) {
                    throw new Error('Token refresh failed');
                }

                localStorage.setItem('token', nextToken);
                if (nextRefreshToken) {
                    localStorage.setItem('refreshToken', nextRefreshToken);
                }

                onRefreshed(nextToken);
                originalRequest.headers = originalRequest.headers || {};
                originalRequest.headers.Authorization = `Bearer ${nextToken}`;
                return api(originalRequest);
            } catch (refreshError) {
                onRefreshed(null);
                clearAuthStorage();
                window.location.href = '/login';
                return Promise.reject(refreshError);
            } finally {
                isRefreshing = false;
            }
        }

        if (status === 401) {
            clearAuthStorage();
            window.location.href = '/login';
        }

        // FE-003: Provide user feedback for common error categories
        if (status === 403) {
            showRateLimitedErrorToast(
                'permission-403',
                'You do not have permission to perform this action.',
                TOAST_COOLDOWN_MS.permission,
                'permission-403'
            );
        } else if (status === 429) {
            showRateLimitedErrorToast(
                'rate-limit-429',
                'Too many requests. Please wait a moment and try again.',
                TOAST_COOLDOWN_MS.rateLimit,
                'rate-limit-429'
            );
        } else if (status >= 500) {
            showRateLimitedErrorToast(
                'server-5xx',
                'Server error. Please try again later.',
                TOAST_COOLDOWN_MS.server,
                'server-5xx'
            );
        } else if (error.code === 'ECONNABORTED') {
            showRateLimitedErrorToast(
                'timeout',
                'Request timed out. Please check your connection and try again.',
                TOAST_COOLDOWN_MS.timeout,
                'timeout'
            );
        } else if (!error.response) {
            showRateLimitedErrorToast(
                'network-offline',
                'Connection lost. Please check your internet connection.',
                TOAST_COOLDOWN_MS.network,
                'network-offline'
            );
        }

        return Promise.reject(error);
    }
);

export default api;
