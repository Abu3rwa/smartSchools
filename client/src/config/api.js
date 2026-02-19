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
    (error) => {
        if (error.response?.status === 401) {
            // Token expired or invalid
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/';
        }
        return Promise.reject(error);
    }
);

export default api;
