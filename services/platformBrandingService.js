import LandingPageContent from '../models/LandingPageContent.js';
import { LANDING_CONTENT_KEY } from '../config/landingPageDefaults.js';
import { getLandingContentDefaults } from '../utils/landingContent.js';

const BRANDING_CACHE_TTL_MS = 5 * 60 * 1000;
const GENERIC_APP_NAME = 'School Platform';

const cache = {
  expiresAt: 0,
  branding: null,
};

const normalizeBranding = (brand = {}) => {
  const defaults = getLandingContentDefaults();
  const fallbackBrand = defaults?.brand || {};

  const appName = String(brand?.name || fallbackBrand?.name || GENERIC_APP_NAME).trim() || GENERIC_APP_NAME;
  const supportEmail = String(brand?.supportEmail || fallbackBrand?.supportEmail || '').trim();
  const copyrightName = String(brand?.copyrightName || appName).trim() || appName;

  return {
    appName,
    supportEmail,
    copyrightName,
  };
};

export const getPlatformBranding = async ({ forceRefresh = false } = {}) => {
  const now = Date.now();
  if (!forceRefresh && cache.branding && cache.expiresAt > now) {
    return cache.branding;
  }

  const contentDoc = await LandingPageContent.findOne({ key: LANDING_CONTENT_KEY })
    .select('content')
    .setOptions({ skipTenantFilter: true })
    .lean();

  const branding = normalizeBranding(contentDoc?.content?.brand);
  cache.branding = branding;
  cache.expiresAt = now + BRANDING_CACHE_TTL_MS;

  return branding;
};

export default getPlatformBranding;