// Mirrors server/constants/practiceQuestionTypes.js so a shared authoring or grading rule
// is written once per side and the client never re-invents a type name.
export const PRACTICE_QUESTION_TYPES = [
    'multiple_choice',
    'true_false',
    'short_answer',
    'multiple_select',
    'matching',
    'ordering',
    'fill_in_blank',
    'numeric_response'
];

// Only these are authored by the generator; every other type must be written by a teacher or imported.
export const AI_GENERATED_QUESTION_TYPES = ['multiple_choice', 'true_false', 'short_answer'];

export const OBJECTIVE_PRACTICE_QUESTION_TYPES = [
    'multiple_select',
    'matching',
    'ordering',
    'fill_in_blank',
    'numeric_response'
];

// A pool row stores its key in this grammar: pairs and options split on '|', a term from its
// match on '::', accepted variants on '~', and sequence steps on '>'.
export const PRACTICE_PAIR_SEPARATOR = '|';
export const PRACTICE_TERM_SEPARATOR = '::';
export const PRACTICE_VARIANT_SEPARATOR = '~';
export const PRACTICE_ORDER_SEPARATOR = '>';
export const PRACTICE_MIN_PAIRS = 2;
export const PRACTICE_MIN_ORDER_ITEMS = 3;
export const PRACTICE_MAX_ORDER_ITEMS = 8;
export const PRACTICE_MIN_OPTIONS = 2;
export const PRACTICE_MAX_OPTIONS = 6;

export const DEFAULT_PRACTICE_QUESTION_TYPES = ['multiple_choice', 'true_false'];
