import { landingPageDefaultContent } from '../config/landingPageDefaults.js';

const MAX_STRING_LENGTH = 800;
const MAX_ARRAY_LENGTH = 20;

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

const clone = (value) => JSON.parse(JSON.stringify(value));

const sanitizeString = (value, fallback = '') => {
  if (typeof value !== 'string') return fallback;
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;
  return normalized.slice(0, MAX_STRING_LENGTH);
};

const sanitizePrimitive = (value, fallback) => {
  if (typeof fallback === 'string') return sanitizeString(value, fallback);
  if (typeof fallback === 'boolean') return typeof value === 'boolean' ? value : fallback;
  if (typeof fallback === 'number') return Number.isFinite(value) ? value : fallback;
  return fallback;
};

const normalizeByShape = (input, shape) => {
  if (Array.isArray(shape)) {
    const source = Array.isArray(input) ? input : shape;
    const itemShape = shape[0];
    if (typeof itemShape === 'undefined') {
      return source.slice(0, MAX_ARRAY_LENGTH);
    }

    const normalizedItems = source
      .slice(0, MAX_ARRAY_LENGTH)
      .map((item) => normalizeByShape(item, itemShape))
      .filter((item) => {
        if (typeof item === 'string') return item.trim().length > 0;
        if (Array.isArray(item)) return item.length > 0;
        if (isObject(item)) return Object.values(item).some(Boolean);
        return Boolean(item);
      });

    return normalizedItems.length > 0 ? normalizedItems : clone(shape);
  }

  if (isObject(shape)) {
    const source = isObject(input) ? input : {};
    const normalizedObject = {};
    for (const key of Object.keys(shape)) {
      normalizedObject[key] = normalizeByShape(source[key], shape[key]);
    }
    return normalizedObject;
  }

  return sanitizePrimitive(input, shape);
};

const mergeDeep = (base, patch) => {
  if (Array.isArray(base)) {
    return Array.isArray(patch) ? patch : base;
  }

  if (!isObject(base)) {
    return typeof patch === 'undefined' ? base : patch;
  }

  const next = { ...base };
  if (!isObject(patch)) return next;

  for (const [key, value] of Object.entries(patch)) {
    if (typeof value === 'undefined') continue;
    next[key] = key in base ? mergeDeep(base[key], value) : value;
  }
  return next;
};

export const resolveLandingTemplate = (template, variables = {}) => {
  if (typeof template !== 'string') return '';
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (Object.prototype.hasOwnProperty.call(variables, key)) {
      return String(variables[key]);
    }
    return '';
  });
};

export const getLandingContentDefaults = () => clone(landingPageDefaultContent);

export const normalizeLandingContent = (input) =>
  normalizeByShape(input, landingPageDefaultContent);

export const mergeLandingContent = (base, patch) => mergeDeep(base, patch);

