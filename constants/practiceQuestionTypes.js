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

// Types the AI generator may author. Any new type must ship an authoring UI and a
// deterministic grader before it can be added here.
export const AI_GENERATED_QUESTION_TYPES = ['multiple_choice', 'true_false', 'short_answer'];

export const OBJECTIVE_PRACTICE_QUESTION_TYPES = [
  'multiple_select',
  'matching',
  'ordering',
  'fill_in_blank',
  'numeric_response'
];

export const PRACTICE_TYPE_ALIASES = {
  mcq: 'multiple_choice',
  multi_select: 'multiple_select',
  short_text: 'short_answer',
  essay: 'short_answer',
  sequence: 'ordering',
  order: 'ordering',
  fill_blank: 'fill_in_blank',
  cloze: 'fill_in_blank',
  numeric: 'numeric_response',
  number: 'numeric_response'
};

export const resolvePracticeQuestionType = (value) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (PRACTICE_QUESTION_TYPES.includes(normalized)) return normalized;
  return PRACTICE_TYPE_ALIASES[normalized] || normalized;
};

export const isPracticeQuestionType = (value) => (
  PRACTICE_QUESTION_TYPES.includes(resolvePracticeQuestionType(value))
);

export const isObjectivePracticeQuestionType = (value) => (
  OBJECTIVE_PRACTICE_QUESTION_TYPES.includes(resolvePracticeQuestionType(value))
);

// Authoring and response encodings. Each objective type owns one flat string grammar so
// CSV import and the stored key stay readable for teachers.
export const PRACTICE_PAIR_SEPARATOR = '|';
export const PRACTICE_TERM_SEPARATOR = '::';
export const PRACTICE_VARIANT_SEPARATOR = '~';
export const PRACTICE_ORDER_SEPARATOR = '>';
export const PRACTICE_MIN_PAIRS = 2;
export const PRACTICE_MIN_ORDER_ITEMS = 3;
export const PRACTICE_MAX_ORDER_ITEMS = 8;
export const PRACTICE_MIN_OPTIONS = 2;
export const PRACTICE_MAX_OPTIONS = 6;
