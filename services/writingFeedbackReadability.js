/**
 * Reading-level control for generated feedback (A4). The measure is deterministic
 * and runs on the server, so a teacher, the eval harness and a later audit all
 * read the same number. Text it cannot improve is reported, never silently kept:
 * the assessment stores the score so the eval gate can fail a prompt change.
 */

import { MAX_EXPLANATION_CHARS } from "../client/src/utils/writingMechanics.js";

export const READABILITY_CEILINGS = {
    emerging: 6.5,
    developing: 9,
    secure: 12
};

const MAX_SENTENCE_WORDS = {
    emerging: 14,
    developing: 20,
    secure: 26
};

export const readabilityCeiling = (tier) =>
    READABILITY_CEILINGS[tier] ?? READABILITY_CEILINGS.developing;

export const maxSentenceWords = (tier) =>
    MAX_SENTENCE_WORDS[tier] ?? MAX_SENTENCE_WORDS.developing;

const wordsOf = (text) =>
    String(text ?? '')
        .normalize('NFKC')
        .split(/\s+/)
        .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
        .filter(Boolean);

const sentenceParts = (text) =>
    String(text ?? '')
        .split(/(?<=[.!?؟])\s+/u)
        .map((row) => row.trim())
        .filter(Boolean);

/** Vowel groups are a sound enough syllable estimate for a reading-level gate. */
const syllables = (word) => {
    const groups = String(word ?? '').toLowerCase().match(/[aeiouy]+/g);
    return Math.max(1, groups ? groups.length : 1);
};

/**
 * A Flesch–Kincaid grade estimate for Latin script. Arabic words are shorter
 * and carry their vowels as marks, so its estimate comes from sentence length
 * and word length instead. Both land on the same rough grade scale.
 */
export const readabilityOf = (text) => {
    const words = wordsOf(text);
    const sentences = sentenceParts(text);
    if (!words.length) return { score: 0, words: 0, sentences: 0 };
    const sentenceCount = Math.max(1, sentences.length);
    const avgSentence = words.length / sentenceCount;
    const isArabic = /[\u0600-\u06FF]/.test(String(text ?? ''));
    const avgWordLength = words.join('').length / words.length;
    const score = isArabic
        ? 0.35 * avgSentence + 0.8 * avgWordLength
        : 0.39 * avgSentence
            + 11.8 * (words.reduce((sum, word) => sum + syllables(word), 0) / words.length)
            - 15.59;
    return {
        score: Math.max(0, Math.round(score * 10) / 10),
        words: words.length,
        sentences: sentenceCount
    };
};

const CLAUSE_BREAKS = ['; ', ', and ', ', but ', ', so ', ', because ', ', which ', ', while ', ' and then '];

const upperFirst = (value) => {
    const text = String(value ?? '');
    return text ? text[0].toUpperCase() + text.slice(1) : text;
};

const splitLongSentence = (sentence, limit) => {
    const words = sentence.split(/\s+/);
    if (words.length <= limit) return [sentence];
    const lower = ` ${sentence} `;
    let cut = -1;
    for (const breaker of CLAUSE_BREAKS) {
        const at = lower.indexOf(breaker, Math.floor(lower.length / 3));
        if (at !== -1 && at < lower.length - breaker.length - 5) {
            const position = lower.slice(0, at).split(/\s+/).length - 1;
            if (position > 2 && position < words.length - 2) {
                cut = position;
                break;
            }
        }
    }
    if (cut === -1) {
        // No clause boundary: split near the middle, keeping punctuation in place.
        cut = Math.floor(words.length / 2);
        const head = words.slice(0, cut).join(' ').replace(/[,;]$/, '');
        const tail = words.slice(cut).join(' ');
        return [`${head}.`, upperFirst(tail)];
    }
    const head = words
        .slice(0, cut)
        .join(' ')
        .replace(/[,;]$/, '')
        .replace(/\s+(?:and|but|so|because|which|while)$/i, '');
    const tail = words.slice(cut).join(' ').replace(/^(and|but|so|because|which|while)\s+/i, '');
    return [`${head}.`, upperFirst(tail)];
};

/**
 * Shorten only the sentence shape. Words, quotes and meaning are untouched:
 * a quote that is evidence must stay exactly the child's own words.
 */
export const simplifyForTier = (text, tier) => {
    const limit = maxSentenceWords(tier);
    let current = String(text ?? '');
    for (let pass = 0; pass < 3; pass += 1) {
        const parts = sentenceParts(current);
        if (!parts.some((row) => wordsOf(row).length > limit)) break;
        current = parts
            .flatMap((row) => splitLongSentence(row, limit))
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
    }
    return current;
};

/** The prose a child reads; evidence quotes are never simplified. */
const PROSE_FIELDS = ['why', 'nextStep'];

export const simplifyFeedbackFields = (fields, tier) => {
    const sections = (fields.sections || []).map((section) => {
        const next = { ...section };
        for (const field of PROSE_FIELDS) {
            if (next[field]) next[field] = simplifyForTier(next[field], tier);
        }
        if ((next.strengths || []).length) {
            next.strengths = next.strengths.map((row) => simplifyForTier(row, tier));
        }
        if ((next.improvements || []).length) {
            next.improvements = next.improvements.map((row) => simplifyForTier(row, tier));
        }
        // Scaffold text is written for the child too.
        if (next.scaffold?.text) {
            next.scaffold = { ...next.scaffold, text: simplifyForTier(next.scaffold.text, tier) };
        }
        // Language-correction explanations are child-facing prose; the source
        // slice, replacement and anchor are never transformed. A simplification
        // that would push the reason past its stored cap keeps the valid one.
        if ((next.mechanics || []).length) {
            next.mechanics = next.mechanics.map((row) => {
                if (!row?.explanation) return row;
                const simplified = simplifyForTier(row.explanation, tier);
                return simplified && simplified.length <= MAX_EXPLANATION_CHARS
                    ? { ...row, explanation: simplified }
                    : row;
            });
        }
        return next;
    });
    const overall = { ...fields.overall };
    if (overall.summary) overall.summary = simplifyForTier(overall.summary, tier);
    if ((overall.nextPriorities || []).length) {
        overall.nextPriorities = overall.nextPriorities.map((row) => simplifyForTier(row, tier));
    }
    const comparison = fields.comparison
        ? { ...fields.comparison }
        : undefined;
    if (comparison?.encouragement) {
        comparison.encouragement = simplifyForTier(comparison.encouragement, tier);
    }
    return { ...fields, sections, overall, ...(comparison ? { comparison } : {}) };
};

/** One number for the child-facing prose, measured after simplification. */
export const feedbackReadability = (fields) => {
    const parts = [];
    for (const section of fields.sections || []) {
        for (const field of PROSE_FIELDS) if (section[field]) parts.push(section[field]);
        parts.push(...(section.strengths || []), ...(section.improvements || []));
        if (section.scaffold?.text) parts.push(section.scaffold.text);
        for (const row of section.mechanics || []) {
            if (row?.explanation) parts.push(row.explanation);
        }
    }
    if (fields.overall?.summary) parts.push(fields.overall.summary);
    parts.push(...(fields.overall?.nextPriorities || []));
    return readabilityOf(parts.join(' '));
};

export const readabilityVerdict = ({ fields, tier }) => {
    const ceiling = readabilityCeiling(tier);
    const measured = feedbackReadability(fields);
    return {
        score: measured.score,
        ceiling,
        ok: measured.score <= ceiling,
        words: measured.words,
        sentences: measured.sentences
    };
};
