/**
 * Turns a passage and a transcript into comparable words.
 *
 * The reference keeps one unit per word the student sees. A unit may have more
 * than one spoken form ("1765" is "seventeen sixty five" or "one thousand seven
 * hundred sixty five"), so alignment never punishes a correct reading just
 * because the speech model chose a different spelling.
 */
const TOKEN_PATTERN = /\p{N}+(?:[.,]\p{N}+)*(?:st|nd|rd|th)?|\p{L}[\p{L}\p{M}]*(?:['’\u002d\u2013\u2014][\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*/giu;

const DASH_PATTERN = /[\u002d\u2013\u2014]/;

const FILLERS = new Set(['um', 'uh', 'uhm', 'erm', 'er', 'ah', 'eh', 'hmm', 'mmm']);

const SPELLING_VARIANTS = new Map(Object.entries({
    colour: 'color',
    colours: 'colors',
    coloured: 'colored',
    favourite: 'favorite',
    favourites: 'favorites',
    centre: 'center',
    centres: 'centers',
    theatre: 'theater',
    theatres: 'theaters',
    organise: 'organize',
    organised: 'organized',
    organising: 'organizing',
    organisation: 'organization',
    realise: 'realize',
    realised: 'realized',
    realising: 'realizing',
    defence: 'defense',
    offence: 'offense',
    neighbour: 'neighbor',
    neighbours: 'neighbors',
    travelled: 'traveled',
    travelling: 'traveling',
    cancelled: 'canceled',
    programme: 'program',
    judgement: 'judgment',
    grey: 'gray',
    learnt: 'learned',
    spelt: 'spelled',
    whilst: 'while',
    amongst: 'among',
    towards: 'toward',
    practise: 'practice',
    licence: 'license',
    analyse: 'analyze',
    analysed: 'analyzed',
    analysing: 'analyzing',
    catalogue: 'catalog'
}));

const ONES = [
    'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
    'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
    'seventeen', 'eighteen', 'nineteen'
];

const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

const ORDINAL_ONES = [
    'zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh',
    'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth',
    'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth'
];

const ORDINAL_TENS = ['', '', 'twentieth', 'thirtieth', 'fortieth', 'fiftieth', 'sixtieth', 'seventieth', 'eightieth', 'ninetieth'];

const ROMAN_VALUES = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };

const HALLUCINATION_PHRASES = [
    'thank you for watching',
    'thanks for watching',
    'thank you so much for watching',
    'please subscribe',
    'subscribe to my channel',
    'subtitles by',
    'amaraorg',
    'transcribed by',
    'see you next time'
];

const numberWords = (value) => {
    const n = Math.floor(Number(value) || 0);
    if (n < 0) return [];
    if (n < 20) return [ONES[n]];
    if (n < 100) {
        const rest = n % 10;
        return rest ? [TENS[Math.floor(n / 10)], ONES[rest]] : [TENS[n / 10]];
    }
    if (n < 1000) {
        const rest = n % 100;
        return [ONES[Math.floor(n / 100)], 'hundred', ...(rest ? numberWords(rest) : [])];
    }
    if (n < 1000000) {
        const rest = n % 1000;
        return [...numberWords(Math.floor(n / 1000)), 'thousand', ...(rest ? numberWords(rest) : [])];
    }
    return String(n).split('').map((digit) => ONES[Number(digit)]);
};

const ordinalWords = (value) => {
    const n = Math.floor(Number(value) || 0);
    if (n < 20) return [ORDINAL_ONES[n] || `${ONES[n]}th`];
    if (n < 100) {
        const rest = n % 10;
        return rest
            ? [TENS[Math.floor(n / 10)], ORDINAL_ONES[rest]]
            : [ORDINAL_TENS[n / 10]];
    }
    if (n < 1000) {
        const rest = n % 100;
        return rest
            ? [ONES[Math.floor(n / 100)], 'hundred', ...ordinalWords(rest)]
            : [ONES[Math.floor(n / 100)], 'hundredth'];
    }
    if (n < 1000000) {
        const rest = n % 1000;
        return rest
            ? [...numberWords(Math.floor(n / 1000)), 'thousand', ...ordinalWords(rest)]
            : [...numberWords(Math.floor(n / 1000)), 'thousandth'];
    }
    return numberWords(n);
};

const yearWords = (value) => {
    const n = Math.floor(Number(value) || 0);
    if (n === 1000) return ['one', 'thousand'];
    if (n < 1100) return [...numberWords(Math.floor(n / 100)), n % 100 ? 'oh' : 'hundred', ...(n % 100 ? numberWords(n % 100) : [])];
    if (n < 2000) {
        const high = Math.floor(n / 100);
        const low = n % 100;
        if (!low) return [...numberWords(high), 'hundred'];
        if (low < 10) return [...numberWords(high), 'oh', ...numberWords(low)];
        return [...numberWords(high), ...numberWords(low)];
    }
    if (n < 2010) return numberWords(n);
    const high = Math.floor(n / 100);
    const low = n % 100;
    if (!low) return [...numberWords(high), 'hundred'];
    if (low < 10) return [...numberWords(high), 'oh', ...numberWords(low)];
    return [...numberWords(high), ...numberWords(low)];
};

export const romanValue = (raw) => {
    const text = String(raw || '').toUpperCase();
    if (!/^[IVXLCDM]+$/.test(text)) return null;
    let total = 0;
    for (let index = 0; index < text.length; index += 1) {
        const current = ROMAN_VALUES[text[index]];
        const next = ROMAN_VALUES[text[index + 1]] || 0;
        total += current < next ? -current : current;
    }
    return total > 0 ? total : null;
};

const stripPossessive = (raw) => String(raw || '').replace(/['’]s$/i, '');

const canonicalToken = (raw) => {
    const cleaned = stripPossessive(raw)
        .normalize('NFKC')
        .toLocaleLowerCase()
        .replace(/['’]/g, '')
        .replace(/[^\p{L}\p{N}]/gu, '');
    return SPELLING_VARIANTS.get(cleaned) || cleaned;
};

const dedupeVariants = (variants) => {
    const seen = new Set();
    const result = [];
    for (const variant of variants) {
        const cleaned = variant.map((token) => canonicalToken(token)).filter(Boolean);
        if (!cleaned.length) continue;
        const key = cleaned.join(' ');
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(cleaned);
    }
    return result;
};

const numericForm = (raw) => {
    const ordinalMatch = String(raw || '').match(/^([\d.,]+)(st|nd|rd|th)$/i);
    const digits = ordinalMatch ? ordinalMatch[1] : String(raw || '');
    if (!/^\d+(?:[.,]\d+)*$/.test(digits)) return null;
    const value = Number(digits.replace(/[.,]/g, ''));
    if (!Number.isFinite(value)) return null;
    return { value, ordinal: Boolean(ordinalMatch) };
};

const spokenFormsForPart = (raw) => {
    const numeric = numericForm(raw);
    if (numeric) {
        if (numeric.ordinal) return [ordinalWords(numeric.value)];
        if (numeric.value >= 1000 && numeric.value <= 2099) {
            return dedupeVariants([yearWords(numeric.value), numberWords(numeric.value)]);
        }
        const forms = [numberWords(numeric.value)];
        if (numeric.value >= 1 && numeric.value <= 31) forms.push(ordinalWords(numeric.value));
        return dedupeVariants(forms);
    }

    const text = String(raw || '');
    const roman = /^[IVXLCDM]+$/.test(text) && text === text.toUpperCase() && text.length >= 2
        ? romanValue(text)
        : null;
    if (roman) {
        return dedupeVariants([
            ['the', ...ordinalWords(roman)],
            numberWords(roman),
            ordinalWords(roman)
        ]);
    }
    return [[canonicalToken(text)]];
};

const variantsForToken = (raw) => {
    const parts = String(raw || '').split(DASH_PATTERN).filter(Boolean);
    if (!parts.length) return [];
    let combinations = [[]];
    for (const part of parts) {
        const forms = spokenFormsForPart(part);
        const next = [];
        for (const combination of combinations) {
            for (const form of forms) next.push([...combination, ...form]);
        }
        combinations = next;
    }
    if (parts.length > 1 && parts.every((part) => !numericForm(part))) {
        const joined = parts.map((part) => canonicalToken(part)).join('');
        if (joined) combinations.push([joined]);
    }
    return dedupeVariants(combinations).slice(0, 8);
};

const primaryForm = (unit) => (unit?.variants?.[0] || []).join(' ');

export const normalizeReference = (text) => {
    const source = String(text || '');
    const matches = [...source.matchAll(TOKEN_PATTERN)];
    const words = matches.map((match, index) => {
        const raw = match[0];
        const nextIndex = matches[index + 1]?.index ?? source.length;
        const after = source.slice(match.index + raw.length, nextIndex);
        const variants = variantsForToken(raw);
        return {
            display: raw,
            variants: variants.length ? variants : [[canonicalToken(raw)]],
            sentenceEnd: /[.!?]/.test(after)
        };
    });
    return {
        words,
        wordCount: words.length,
        primaryText: words.map(primaryForm).join(' ')
    };
};

/** Transcript words are flat: one normalized token per entry, with its timing when known. */
export const normalizeTranscript = (text, { words: timedWords } = {}) => {
    const source = String(text || '');
    const words = [];

    const remember = (display, normalized, start, end) => {
        if (!normalized || FILLERS.has(normalized)) return;
        words.push({ display, normalized, start, end });
    };

    const addRaw = (raw, start, end) => {
        if (!canonicalToken(raw) || FILLERS.has(canonicalToken(raw))) return;
        for (const token of String(raw).matchAll(TOKEN_PATTERN)) {
            const parts = token[0].split(DASH_PATTERN).filter(Boolean);
            for (const part of parts) {
                const numeric = numericForm(part);
                if (numeric?.ordinal) {
                    for (const word of ordinalWords(numeric.value)) remember(word, word, start, end);
                } else if (numeric) {
                    const wordsForNumber = numeric.value >= 1000 && numeric.value <= 2099
                        ? yearWords(numeric.value)
                        : numberWords(numeric.value);
                    for (const word of wordsForNumber) remember(word, word, start, end);
                } else if (/^[IVXLCDM]+$/.test(part) && part === part.toUpperCase() && part.length >= 2) {
                    for (const word of ['the', ...ordinalWords(romanValue(part))]) remember(word, word, start, end);
                } else {
                    remember(part, canonicalToken(part), start, end);
                }
            }
        }
    };

    if (Array.isArray(timedWords) && timedWords.length) {
        for (const item of timedWords) {
            const start = Number(item?.start);
            const end = Number(item?.end);
            addRaw(
                String(item?.word ?? ''),
                Number.isFinite(start) ? start : null,
                Number.isFinite(end) ? end : null
            );
        }
    } else {
        addRaw(source, null, null);
    }

    return { words, text: source.trim() };
};

/** The speech model invents these on silence; hearing one is not a reading. */
export const isHallucinationPhrase = (text) => {
    const normalized = String(text || '')
        .toLocaleLowerCase()
        .replace(/[^\p{L}\p{N} ]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!normalized) return false;
    const wordCount = normalized.split(' ').filter(Boolean).length;
    return HALLUCINATION_PHRASES.some((phrase) => (
        normalized === phrase || (wordCount <= 12 && normalized.includes(phrase))
    ));
};

export const normaliseReference = normalizeReference;
export const normaliseTranscript = normalizeTranscript;
