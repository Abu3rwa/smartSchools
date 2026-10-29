export const SPELLING_GRADES = ['KG', 'G1', 'G2', 'G3', 'G4', 'G5'];

/** A student needs this many answered words before a rank means anything. */
export const MIN_ATTEMPTS_FOR_RANKING = 20;

export const ANALYSIS_PROMPT_VERSION = 'spelling-analysis-v1';

/** Fixed taxonomy so the charts stay stable across runs and models. */
export const ERROR_TYPES = [
    'omission',
    'insertion',
    'substitution',
    'transposition',
    'phonetic',
    'vowel',
    'silent-letter',
    'doubling',
    'ending',
    'homophone',
    'other'
];

export const MAX_MISSPELLING_SAMPLES = 120;
