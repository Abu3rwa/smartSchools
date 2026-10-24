const csvCell = (value) => {
  const text = String(value ?? '');
  return /["\n,]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const mapPracticeCsvHeader = [
  'student_id', 'plan_title', 'set_id', 'set_title', 'set_order', 'question_id', 'order',
  'subject', 'strand', 'skill_code', 'skill_name', 'rit_band', 'passage_id', 'passage_title',
  'passage_text', 'question_type', 'stem', 'option_a', 'option_b', 'option_c', 'option_d',
  'correct_answer', 'explanation', 'distractor_note', 'points',
  'matching_pairs', 'ordering_items', 'blank_answers', 'numeric_rule', 'passage_source'
];

/**
 * One row per authored question type so a downloaded file shows every column that type reads.
 * Columns a type does not use stay empty.
 */
export const mapPracticeExampleRows = [
  {
    student_id: 'EXAMPLE-001', plan_title: 'Example plan', set_id: 'SET-1', set_title: 'Sample set', set_order: 1,
    question_id: 'Q-1', order: 1, subject: 'Reading', strand: 'Vocabulary', skill_code: 'VOC-1', skill_name: 'Context clues',
    rit_band: '201-210', passage_id: 'P-1', passage_title: 'The first map tests',
    passage_text: 'MAP practice grew out of adaptive testing, where one question cannot tell you much about a student.',
    question_type: 'mcq', stem: 'What does the passage say about a single question?',
    option_a: 'It gives a complete picture', option_b: 'It gives limited information', option_c: 'It sets the final grade', option_d: 'It replaces the teacher',
    correct_answer: 'B', explanation: 'The passage says one question cannot tell you much.', distractor_note: 'A is the opposite of the sentence.', points: 1
  },
  {
    student_id: 'EXAMPLE-001', plan_title: 'Example plan', set_id: 'SET-1', set_title: 'Sample set', set_order: 1,
    question_id: 'Q-2', order: 2, subject: 'Reading', strand: 'Vocabulary', skill_code: 'VOC-1', skill_name: 'Context clues',
    rit_band: '201-210', question_type: 'multi_select', stem: 'Which words are signal words for cause and effect?',
    option_a: 'because', option_b: 'however', option_c: 'therefore', option_d: 'although',
    correct_answer: 'A|C', explanation: 'Because and therefore show cause and effect.', points: 1
  },
  {
    student_id: 'EXAMPLE-001', plan_title: 'Example plan', set_id: 'SET-1', set_title: 'Sample set', set_order: 1,
    question_id: 'Q-3', order: 3, subject: 'Social Studies', strand: 'History', skill_code: 'HIST-1', skill_name: 'Ancient Egypt',
    rit_band: '201-210', question_type: 'matching', stem: 'Match each term with its definition.',
    correct_answer: '', explanation: 'Every term keeps its own definition.', points: 1,
    matching_pairs: 'Nile::The longest river in Africa|Sahara::The largest hot desert|Hieroglyphs::The picture writing of ancient Egypt'
  },
  {
    student_id: 'EXAMPLE-001', plan_title: 'Example plan', set_id: 'SET-1', set_title: 'Sample set', set_order: 1,
    question_id: 'Q-4', order: 4, subject: 'Social Studies', strand: 'History', skill_code: 'HIST-2', skill_name: 'Sequencing',
    rit_band: '201-210', question_type: 'ordering', stem: 'Put these events in the order they happened.',
    explanation: 'Written sources come before the printing press.', points: 1,
    ordering_items: 'Hieroglyphs are developed > The Rosetta Stone is carved > Napoleon’s expedition reaches Egypt > The stone is deciphered'
  },
  {
    student_id: 'EXAMPLE-001', plan_title: 'Example plan', set_id: 'SET-1', set_title: 'Sample set', set_order: 1,
    question_id: 'Q-5', order: 5, subject: 'Social Studies', strand: 'Geography', skill_code: 'GEO-1', skill_name: 'Physical features',
    rit_band: '201-210', question_type: 'fill_in_blank', stem: 'The {{nile}} flows north into the {{sea}}.',
    explanation: 'Names of the two water bodies.', points: 1,
    blank_answers: 'nile::Nile~the Nile|sea::Mediterranean Sea~Mediterranean'
  },
  {
    student_id: 'EXAMPLE-001', plan_title: 'Example plan', set_id: 'SET-1', set_title: 'Sample set', set_order: 1,
    question_id: 'Q-6', order: 6, subject: 'Math', strand: 'Measurement', skill_code: 'MATH-1', skill_name: 'Distance',
    rit_band: '201-210', question_type: 'numeric_response', stem: 'The map scale is 1 cm to 25 km. How many km are 4 cm on the map?',
    explanation: '4 x 25 = 100.', points: 1, numeric_rule: 'exact::100|unit::km'
  },
  {
    student_id: 'EXAMPLE-001', plan_title: 'Example plan', set_id: 'SET-1', set_title: 'Sample set', set_order: 1,
    question_id: 'Q-7', order: 7, subject: 'Reading', strand: 'Short answer', skill_code: 'READ-1', skill_name: 'Main idea',
    rit_band: '201-210', passage_id: 'P-1', question_type: 'short_text', stem: 'In one sentence, what is the main idea of the passage?',
    correct_answer: 'Adaptive tests read a student, not score them.', explanation: 'Any answer naming adaptive reading goes to review.', points: 1
  }
];

export const buildMapPracticeCsv = (rows = mapPracticeExampleRows, header = mapPracticeCsvHeader) => (
  `${[header.join(','), ...rows.map((row) => header.map((column) => csvCell(row[column])).join(','))].join('\n')}\n`
);

export const mapPracticeBlankTemplate = `${mapPracticeCsvHeader.join(',')}\n`;
