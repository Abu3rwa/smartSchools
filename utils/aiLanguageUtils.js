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

const ARABIC_CHAR = /[\u0600-\u06FF\u0750-\u077F\u0870-\u089F\u08A0-\u08FF]/;
const URDU_CHAR = /[\u0679\u0688\u0691\u06BA\u06BE\u06D2\u06D3]/;
const LATIN_WORD = /[a-zà-öø-ÿœßçğıöşü]+/gi;
const ARABIC_WORD = /[\u0600-\u06FF]+/g;

// Common function words per supported language. Words shared across languages
// ("de", "que") still count, so the winner is only trusted with a clear margin.
const LANGUAGE_MARKERS = {
    en: new Set([
        'the', 'what', 'which', 'why', 'how', 'when', 'where', 'who', 'whom',
        'is', 'are', 'was', 'were', 'and', 'with', 'for', 'your', 'you',
        'answer', 'answers', 'explain', 'describe', 'name', 'named', 'correct',
        'incorrect', 'partly', 'because', 'between', 'of', 'to', 'in', 'that',
        'this', 'these', 'those', 'it', 'they', 'good', 'right', 'points',
        'credit', 'full', 'mention', 'mentions'
    ]),
    es: new Set([
        'el', 'los', 'las', 'del', 'pero', 'más', 'mas', 'también', 'tambien',
        'porque', 'entre', 'respuesta', 'correcto', 'correcta', 'faltó',
        'falto', 'faltan', 'mencionas', 'intercambio', 'cuál', 'cual', 'qué',
        'que', 'es', 'son', 'una', 'uno', 'y', 'de', 'como', 'para', 'por',
        'con', 'su', 'bien', 'buena', 'buen', 'muy', 'pero', 'no', 'se'
    ]),
    pt: new Set([
        'não', 'nao', 'uma', 'com', 'isso', 'está', 'esta', 'também', 'tambem',
        'resposta', 'correto', 'correta', 'você', 'voce', 'mas', 'são', 'sao',
        'foi', 'muito', 'bem', 'qual', 'para', 'por', 'de', 'que', 'como', 'no'
    ]),
    fr: new Set([
        'les', 'des', 'une', 'est', 'pour', 'avec', 'mais', 'réponse',
        'reponse', 'correcte', 'bonne', 'vous', 'dans', 'sur', 'pas', 'qui',
        'de', 'que', 'le', 'la', 'du', 'au', 'aux', 'bien', 'très', 'tres'
    ]),
    tr: new Set([
        'bir', 've', 'bu', 'için', 'icin', 'cevap', 'doğru', 'dogru', 'nedir',
        'değil', 'degil', 'çok', 'cok', 'gibi', 'ile', 'olarak', 'ama', 'fakat'
    ])
};

const URDU_MARKERS = new Set([
    'ہے', 'کا', 'کی', 'کو', 'میں', 'اور', 'یہ', 'نہیں', 'یہاں', 'آپ', 'کے'
]);

const scoreLatinLanguages = (words) => {
    const scores = new Map();
    words.forEach((word) => {
        Object.entries(LANGUAGE_MARKERS).forEach(([code, markers]) => {
            if (markers.has(word)) scores.set(code, (scores.get(code) || 0) + 1);
        });
    });
    return scores;
};

const pickBest = (scores) => {
    const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
    if (ranked.length === 0) return null;
    const [best, second] = ranked;
    if (best[1] < 1) return null;
    if (second && second[1] >= best[1]) return null;
    return best[0];
};

/**
 * Best-effort language code of a text. Returns null when the text is too short
 * or too ambiguous to call, so callers can decide on a fallback instead of
 * acting on a guess.
 */
export const detectLanguageCode = (value) => {
    const text = String(value || '').trim();
    if (!text) return null;

    const letters = Array.from(text).filter((char) => /\p{L}/u.test(char));
    if (letters.length === 0) return null;

    const arabicLetters = letters.filter((char) => ARABIC_CHAR.test(char)).length;
    if (arabicLetters / letters.length >= 0.3) {
        const urduWords = text.match(ARABIC_WORD) || [];
        const urduHit = URDU_CHAR.test(text)
            || urduWords.some((word) => URDU_MARKERS.has(word));
        return urduHit ? 'ur' : 'ar';
    }

    const words = (text.match(LATIN_WORD) || []).map((word) => word.toLowerCase());
    return pickBest(scoreLatinLanguages(words));
};

/** The language a quiz question is written in; its reference text is the backup. */
export const resolveContentLanguageCode = ({ question, modelAnswer, rubric } = {}) => {
    return detectLanguageCode(question)
        || detectLanguageCode([modelAnswer, rubric].filter(Boolean).join(' '))
        || 'en';
};

export const isRtlLanguageCode = (code = 'en') => {
    const normalized = normalizeLanguageCode(code);
    if (!normalized) return false;
    return Boolean(AI_LANGUAGE_CATALOG.find((item) => item.code === normalized)?.rtl);
};
