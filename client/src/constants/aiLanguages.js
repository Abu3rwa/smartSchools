export const AI_LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'ar', label: 'Arabic' },
  { value: 'fr', label: 'French' },
  { value: 'es', label: 'Spanish' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'tr', label: 'Turkish' },
  { value: 'ur', label: 'Urdu' }
];

export const AI_LANGUAGE_VALUE_SET = new Set(AI_LANGUAGE_OPTIONS.map((item) => item.value));

export const buildRequestedLanguages = (primaryLanguage, secondaryLanguage = '') => {
  const normalizedPrimary = String(primaryLanguage || '').trim().toLowerCase();
  const normalizedSecondary = String(secondaryLanguage || '').trim().toLowerCase();
  const requested = [];

  if (AI_LANGUAGE_VALUE_SET.has(normalizedPrimary)) {
    requested.push(normalizedPrimary);
  }
  if (
    AI_LANGUAGE_VALUE_SET.has(normalizedSecondary) &&
    normalizedSecondary !== normalizedPrimary
  ) {
    requested.push(normalizedSecondary);
  }

  return requested.slice(0, 2);
};

export const toLegacyLanguageValue = (requestedLanguages = []) => {
  const normalized = (Array.isArray(requestedLanguages) ? requestedLanguages : [])
    .map((item) => String(item || '').trim().toLowerCase())
    .filter((item) => AI_LANGUAGE_VALUE_SET.has(item))
    .slice(0, 2);

  if (normalized.length === 2 && normalized.includes('en') && normalized.includes('ar')) {
    return 'bilingual';
  }
  if (normalized[0] === 'ar') return 'arabic';
  if (normalized[0] === 'en') return 'english';
  return normalized[0] || 'english';
};
