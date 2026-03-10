import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import resourcesToBackend from 'i18next-resources-to-backend';
import { initReactI18next } from 'react-i18next';
import {
    DEFAULT_LANGUAGE,
    LANGUAGE_STORAGE_KEY,
    SUPPORTED_LANGUAGES,
    normalizeLanguage
} from './config';

const localeModules = import.meta.glob('./locales/*/*.json');

const loadNamespace = async (language, namespace) => {
    const normalizedLanguage = normalizeLanguage(language);
    const namespacePath = `./locales/${normalizedLanguage}/${namespace}.json`;
    const fallbackPath = `./locales/${DEFAULT_LANGUAGE}/${namespace}.json`;

    const importer = localeModules[namespacePath] || localeModules[fallbackPath];
    if (!importer) {
        return {};
    }

    const module = await importer();
    return module.default;
};

if (!i18n.isInitialized) {
    i18n
        .use(LanguageDetector)
        .use(resourcesToBackend(loadNamespace))
        .use(initReactI18next)
        .init({
            fallbackLng: DEFAULT_LANGUAGE,
            supportedLngs: SUPPORTED_LANGUAGES,
            nonExplicitSupportedLngs: true,
            defaultNS: 'common',
            fallbackNS: 'common',
            ns: ['common'],
            load: 'languageOnly',
            interpolation: {
                escapeValue: false
            },
            react: {
                useSuspense: false
            },
            detection: {
                order: ['localStorage', 'navigator'],
                lookupLocalStorage: LANGUAGE_STORAGE_KEY,
                caches: ['localStorage']
            },
            returnNull: false
        });
}

export default i18n;
