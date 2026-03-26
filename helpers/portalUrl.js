/* eslint-disable no-undef */
/**
 * Single source of truth for the frontend / portal URL.
 * Used in notification emails, invite links, push messages, and OAuth redirects.
 */

const PRODUCTION_BASE = 'https://smile3-8c8c5.web.app';

const _cache = { client: null, portal: null };

/**
 * Base frontend URL (no trailing slash).
 * e.g. https://smile3-8c8c5.web.app
 */
export function getClientUrl() {
    if (_cache.client) return _cache.client;
    const raw = process.env.FRONTEND_URL
        || process.env.CLIENT_URL
        || PRODUCTION_BASE;
    // Strip any /portal suffix and trailing slashes so callers get the root origin
    _cache.client = raw.replace(/\/portal\/?$/, '').replace(/\/+$/, '');
    return _cache.client;
}

/**
 * Student / parent portal URL (no trailing slash).
 * e.g. https://smile3-8c8c5.web.app/portal
 */
export function getPortalUrl() {
    if (_cache.portal) return _cache.portal;
    const raw = process.env.PORTAL_URL
        || process.env.FRONTEND_URL
        || process.env.CLIENT_URL
        || `${PRODUCTION_BASE}/portal`;
    _cache.portal = raw.replace(/\/+$/, '');
    // Ensure it ends with /portal
    if (!_cache.portal.endsWith('/portal')) {
        _cache.portal += '/portal';
    }
    return _cache.portal;
}

export function buildPortalLink(path = '') {
    const base = getPortalUrl();
    if (!path) return base;
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${base}${cleanPath}`;
}
