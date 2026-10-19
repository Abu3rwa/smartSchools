/* eslint-disable no-undef */
/**
 * Single source of truth for the frontend / portal URL.
 * Used in notification emails, invite links, push messages, and OAuth redirects.
 */

const PRODUCTION_BASE = 'https://smile3-8c8c5.web.app';

const _cache = { client: null, portal: null };

export function resolvePortalUrl(raw) {
    let portalUrl = String(raw || `${PRODUCTION_BASE}/portal`).replace(/\/+$/, '');
    if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(portalUrl)) {
        portalUrl = `${PRODUCTION_BASE}/portal`;
    }
    if (!portalUrl.endsWith('/portal')) portalUrl += '/portal';
    return portalUrl;
}

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
    _cache.portal = resolvePortalUrl(raw);
    return _cache.portal;
}

export function buildPortalLink(path = '') {
    const base = getPortalUrl();
    if (!path) return base;
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${base}${cleanPath}`;
}
