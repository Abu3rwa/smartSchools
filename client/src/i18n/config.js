export const SUPPORTED_LANGUAGES = ['en', 'ar'];
export const DEFAULT_LANGUAGE = 'en';
export const LANGUAGE_STORAGE_KEY = 'app.lang';

export const normalizeLanguage = (language = DEFAULT_LANGUAGE) => {
    const normalized = String(language).split('-')[0].toLowerCase();
    return SUPPORTED_LANGUAGES.includes(normalized) ? normalized : DEFAULT_LANGUAGE;
};

export const isRtlLanguage = (language = DEFAULT_LANGUAGE) => normalizeLanguage(language) === 'ar';
