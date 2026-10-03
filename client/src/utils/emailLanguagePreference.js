const preferenceKey = (userId) => `gradebook_email_language_${userId || 'default'}`;
const legacyPreferenceKey = (userId) => `gradebook_classwork_email_lang_${userId || 'default'}`;

export const getEmailLanguagePreference = (userId) => {
    try {
        const savedLanguage = window.localStorage.getItem(preferenceKey(userId))
            || window.localStorage.getItem(legacyPreferenceKey(userId));
        return savedLanguage === 'ar' ? 'ar' : 'en';
    } catch {
        return 'en';
    }
};

export const saveEmailLanguagePreference = (userId, language) => {
    try {
        const normalizedLanguage = language === 'ar' ? 'ar' : 'en';
        window.localStorage.setItem(preferenceKey(userId), normalizedLanguage);
        window.localStorage.setItem(legacyPreferenceKey(userId), normalizedLanguage);
    } catch {
        // Local preference storage is optional.
    }
};
