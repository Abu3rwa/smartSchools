import {
  PRACTICE_MAX_ORDER_ITEMS,
  PRACTICE_MIN_OPTIONS,
  PRACTICE_MIN_ORDER_ITEMS,
  PRACTICE_MIN_PAIRS,
  PRACTICE_ORDER_SEPARATOR,
  PRACTICE_PAIR_SEPARATOR,
  PRACTICE_TERM_SEPARATOR,
  PRACTICE_VARIANT_SEPARATOR
} from '../../constants/practiceQuestionTypes.js';

/**
 * One description of what a teacher must type per question type, shared by the CSV guide popup
 * so the guide, the parser and the sample files cannot drift apart.
 */
const TYPE_GUIDE = {
  multiple_choice: {
    answerColumn: 'correct_answer',
    example: 'C',
    optionColumns: true
  },
  true_false: {
    answerColumn: 'correct_answer',
    example: 'true'
  },
  short_answer: {
    answerColumn: 'correct_answer',
    example: `Nile${PRACTICE_VARIANT_SEPARATOR}the Nile`
  },
  multiple_select: {
    answerColumn: 'correct_answer',
    example: `A${PRACTICE_PAIR_SEPARATOR}C`,
    optionColumns: true
  },
  matching: {
    answerColumn: 'matching_pairs',
    example: [
      `Nile${PRACTICE_TERM_SEPARATOR}The longest river in Africa`,
      `Sahara${PRACTICE_TERM_SEPARATOR}The largest hot desert`
    ].join(PRACTICE_PAIR_SEPARATOR)
  },
  ordering: {
    answerColumn: 'ordering_items',
    example: ['Evaporation', 'Condensation', 'Precipitation'].join(PRACTICE_ORDER_SEPARATOR)
  },
  fill_in_blank: {
    answerColumn: 'blank_answers',
    example: [
      `b1${PRACTICE_TERM_SEPARATOR}Nile${PRACTICE_VARIANT_SEPARATOR}the Nile`,
      `b2${PRACTICE_TERM_SEPARATOR}Mediterranean`
    ].join(PRACTICE_PAIR_SEPARATOR),
    stemExample: 'The {{b1}} flows north into the {{b2}}.'
  },
  numeric_response: {
    answerColumn: 'numeric_rule',
    example: `exact${PRACTICE_TERM_SEPARATOR}100${PRACTICE_PAIR_SEPARATOR}unit${PRACTICE_TERM_SEPARATOR}km`
  }
};

const FLOWS = {
  map: {
    promptColumn: 'stem',
    optionRange: ['option_a', 'option_d'],
    types: [
      ['multiple_choice', 'mcq'],
      ['multiple_select', 'multi_select'],
      ['short_answer', 'short_text'],
      ['matching', 'matching'],
      ['ordering', 'ordering'],
      ['fill_in_blank', 'fill_in_blank'],
      ['numeric_response', 'numeric_response']
    ]
  },
  standards: {
    promptColumn: 'question_text',
    optionRange: ['option_a', 'option_f'],
    types: [
      ['multiple_choice', 'multiple_choice'],
      ['true_false', 'true_false'],
      ['short_answer', 'short_answer'],
      ['multiple_select', 'multiple_select'],
      ['matching', 'matching'],
      ['ordering', 'ordering'],
      ['fill_in_blank', 'fill_in_blank'],
      ['numeric_response', 'numeric_response']
    ]
  }
};

export const questionGuideSeparators = () => [
  { key: 'pairs', symbol: PRACTICE_PAIR_SEPARATOR },
  { key: 'terms', symbol: PRACTICE_TERM_SEPARATOR },
  { key: 'variants', symbol: PRACTICE_VARIANT_SEPARATOR },
  { key: 'steps', symbol: PRACTICE_ORDER_SEPARATOR }
];

export const questionGuideLimits = () => ({
  maxOrderItems: PRACTICE_MAX_ORDER_ITEMS,
  minOptions: PRACTICE_MIN_OPTIONS,
  minOrderItems: PRACTICE_MIN_ORDER_ITEMS,
  minPairs: PRACTICE_MIN_PAIRS
});

export const questionGuideRows = (flow) => {
  const config = FLOWS[flow];
  if (!config) throw new Error(`Unknown question guide flow: ${flow}`);
  return config.types.map(([key, token]) => ({
    key,
    token,
    columns: TYPE_GUIDE[key].optionColumns
      ? [...config.optionRange, TYPE_GUIDE[key].answerColumn]
      : [TYPE_GUIDE[key].answerColumn],
    example: TYPE_GUIDE[key].example,
    stemExample: TYPE_GUIDE[key].stemExample
      ? { column: config.promptColumn, value: TYPE_GUIDE[key].stemExample }
      : null
  }));
};
