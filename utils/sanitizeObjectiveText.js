const OBJECTIVE_NOISE_PATTERNS = [
    /\bAt\s+Risk\b/gi,
    /\bScore\s*:\s*\d+(?:\.\d+)?\s*%/gi,
    /\b(Developing|Mastered|Not\s+Started)\b/gi,
    /\bMastery\s*(?:Level|Score)?\s*:\s*[\w.%]+/gi,
    /\(\s*\d+(?:\.\d+)?\s*%\s*\)/g,
    /[-–—]\s*\d+(?:\.\d+)?\s*%/g,
];

const DEGENERATE_PHRASES = [
    /^by the end of/i,
    /^students will be able to\.?$/i,
    /^learners will\.?$/i,
    /^objectives?(?:\s*\(\d+\))?\.?$/i,
];

/**
 * Remove AE telemetry/status fragments from objective labels before using them
 * as AI context.
 *
 * @param {string} raw
 * @returns {string}
 */
export function sanitizeObjectiveText(raw) {
    let value = String(raw || '');

    for (const pattern of OBJECTIVE_NOISE_PATTERNS) {
        value = value.replace(pattern, ' ');
    }

    value = value
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/[,:;|]+$/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();

    return value;
}

/**
 * Treat objective text as degenerate when it is too short to guide generation.
 *
 * @param {string} sanitized
 * @returns {boolean}
 */
export function isObjectiveTextDegenerate(sanitized) {
    const value = String(sanitized || '').trim();
    if (!value) return true;

    if (DEGENERATE_PHRASES.some((pattern) => pattern.test(value))) {
        return true;
    }

    const words = value
        .split(/\s+/)
        .map((item) => item.trim())
        .filter(Boolean);

    return value.length < 30 || words.length < 8;
}
