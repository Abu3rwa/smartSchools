import axios from 'axios';

const API_URL = import.meta.env.PROD
    ? '/api'
    : (import.meta.env.VITE_API_URL || 'http://localhost:5000/api');

// Create axios instance
const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json'
    }
});

let isRefreshing = false;
let refreshSubscribers = [];

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

        return Promise.reject(error);
    }
);

export default api;
