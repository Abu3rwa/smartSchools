export const AI_LANGUAGE_CATALOG = [
    { code: 'en', label: 'English', rtl: false },
    { code: 'ar', label: 'Arabic', rtl: true },
    { code: 'fr', label: 'French', rtl: false },
    { code: 'es', label: 'Spanish', rtl: false },
    { code: 'pt', label: 'Portuguese', rtl: false },
    { code: 'tr', label: 'Turkish', rtl: false },
    { code: 'ur', label: 'Urdu', rtl: true }
];

const SUPPORTED_CODES = new Set(AI_LANGUAGE_CATALOG.map((item) => item.code));

const LANGUAGE_ALIASES = {
    english: 'en',
    arabic: 'ar',
    french: 'fr',
    spanish: 'es',
    portuguese: 'pt',
    turkish: 'tr',
    urdu: 'ur'
};

const MULTI_ALIASES = {
    bilingual: ['en', 'ar']
};

const normalizeToken = (value) => String(value || '').trim().toLowerCase();

const asArray = (value) => {
    if (Array.isArray(value)) return value;
    if (value === undefined || value === null) return [];
    if (typeof value === 'string' && value.includes(',')) {
        return value
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);
    }
    return [value];
};

export const normalizeLanguageCode = (value) => {
    const token = normalizeToken(value);
    if (!token) return null;
    if (SUPPORTED_CODES.has(token)) return token;
    if (LANGUAGE_ALIASES[token]) return LANGUAGE_ALIASES[token];
    return null;
};

export const normalizeRequestedLanguages = (
    value,
    { max = 2, fallback = ['en'], allowEmpty = false } = {}
) => {
    const requested = asArray(value);
    const normalized = [];
    const seen = new Set();

    requested.forEach((item) => {
        const token = normalizeToken(item);
        if (!token) return;

        const mappedMulti = MULTI_ALIASES[token];
        if (Array.isArray(mappedMulti)) {
            mappedMulti.forEach((code) => {
                if (!seen.has(code)) {
                    seen.add(code);
                    normalized.push(code);
                }
            });
            return;
        }

        const code = normalizeLanguageCode(token);
        if (!code || seen.has(code)) return;
        seen.add(code);
        normalized.push(code);
    });

    const limited = normalized.slice(0, Math.max(1, max));
    if (limited.length > 0) return limited;
    if (allowEmpty) return [];
    return normalizeRequestedLanguages(fallback, { max, fallback: ['en'], allowEmpty: false });
};

export const isArabicOrIslamicSubject = (subjectName = '') => {
    const raw = String(subjectName || '').trim().toLowerCase();
    if (!raw) return false;

    const patterns = [
        /\barabic\b/,
        /\bislamic\b/,
        /\bislamic studies\b/,
        /\bislamiyat\b/,
        /\bquran\b/,
        /لغة عربية/,
        /عربي/,
        /دراسات اسلامية/,
        /تربية اسلامية/,
        /قرآن/
    ];

    return patterns.some((pattern) => pattern.test(raw));
};

export const resolveRequestedLanguages = ({
    requestedLanguages,
    primaryLanguage,
    secondaryLanguage,
    language,
    subjectName,
    max = 2
} = {}) => {
    const fromRequested = normalizeRequestedLanguages(requestedLanguages, {
        max,
        fallback: [],
        allowEmpty: true
    });
    if (fromRequested.length > 0) return fromRequested;

    const fromPrimarySecondary = normalizeRequestedLanguages(
        [primaryLanguage, secondaryLanguage].filter(Boolean),
        { max, fallback: [], allowEmpty: true }
    );
    if (fromPrimarySecondary.length > 0) return fromPrimarySecondary;

    const fromLegacy = normalizeRequestedLanguages(language, { max, fallback: [], allowEmpty: true });
    if (fromLegacy.length > 0) return fromLegacy;

    return isArabicOrIslamicSubject(subjectName) ? ['ar'] : ['en'];
};

export const toLegacyLanguageValue = (requestedLanguages = []) => {
    const normalized = normalizeRequestedLanguages(requestedLanguages, { max: 2, fallback: ['en'] });
    if (normalized.length === 2 && normalized.includes('en') && normalized.includes('ar')) {
        return 'bilingual';
    }
    if (normalized[0] === 'ar') return 'arabic';
    if (normalized[0] === 'en') return 'english';
    return normalized[0];
};

export const getLanguageLabel = (code = 'en') => {
    const normalized = normalizeLanguageCode(code) || 'en';
    return AI_LANGUAGE_CATALOG.find((item) => item.code === normalized)?.label || 'English';
};

export const isRtlLanguageCode = (code = 'en') => {
    const normalized = normalizeLanguageCode(code);
    if (!normalized) return false;
    return Boolean(AI_LANGUAGE_CATALOG.find((item) => item.code === normalized)?.rtl);
};
