/* eslint-disable no-undef */
/**
 * Single source of truth for the student/parent portal URL.
 * Used in notification emails, invite links, and push messages.
 */

const _cache = { url: null };

export function getPortalUrl() {
    if (_cache.url) return _cache.url;
    const raw = process.env.PORTAL_URL
        || process.env.FRONTEND_URL
        || process.env.CLIENT_URL
        || 'http://localhost:5173';
    _cache.url = raw.replace(/\/+$/, '');
    return _cache.url;
}

export function buildPortalLink(path = '') {
    const base = getPortalUrl();
    if (!path) return base;
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${base}${cleanPath}`;
}
