import { landingDynamicBlocks } from '../config/landingDynamicBlocks.js';

const SUPPORTED_LANGUAGES = ['en', 'ar'];
const FALLBACK_LANGUAGE = 'en';

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

const parseLanguageInput = (input = '') => String(input).split(',')[0].trim();

export const normalizeLandingLanguage = (input = FALLBACK_LANGUAGE) => {
  const parsed = parseLanguageInput(input).split('-')[0].toLowerCase();
  return SUPPORTED_LANGUAGES.includes(parsed) ? parsed : FALLBACK_LANGUAGE;
};

const resolveLocalizedBlock = (block, language) => {
  if (Array.isArray(block)) {
    const resolvedItems = [];
    let fallbackUsed = false;

    for (const item of block) {
      const result = resolveLocalizedBlock(item, language);
      resolvedItems.push(result.value);
      fallbackUsed = fallbackUsed || result.fallbackUsed;
    }

    return {
      value: resolvedItems,
      fallbackUsed,
    };
  }

  if (!isObject(block)) {
    return {
      value: block,
      fallbackUsed: false,
    };
  }

  const localizedKeys = Object.keys(block).filter((key) => SUPPORTED_LANGUAGES.includes(key));
  if (localizedKeys.length > 0) {
    if (typeof block[language] !== 'undefined') {
      return {
        value: block[language],
        fallbackUsed: false,
      };
    }

    return {
      value: block[FALLBACK_LANGUAGE],
      fallbackUsed: true,
    };
  }

  const resolved = {};
  let fallbackUsed = false;

  for (const [key, nestedValue] of Object.entries(block)) {
    const result = resolveLocalizedBlock(nestedValue, language);
    resolved[key] = result.value;
    fallbackUsed = fallbackUsed || result.fallbackUsed;
  }

  return {
    value: resolved,
    fallbackUsed,
  };
};

export const resolveLandingDynamicBlocks = (requestedLanguage = FALLBACK_LANGUAGE) => {
  const normalizedRequestedLanguage = normalizeLandingLanguage(requestedLanguage);
  const resolvedLanguage = normalizedRequestedLanguage;
  const resolved = resolveLocalizedBlock(landingDynamicBlocks, resolvedLanguage);

  return {
    blocks: resolved.value,
    resolvedLanguage,
    fallbackUsed: resolved.fallbackUsed,
  };
};
