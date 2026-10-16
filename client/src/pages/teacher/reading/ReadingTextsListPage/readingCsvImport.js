const MAX_CSV_BYTES = 700 * 1024;
const MAX_QUESTIONS = 30;
const MAX_SECTIONS = 100;

const parseRows = (source) => {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  let closedQuote = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
        closedQuote = true;
      } else {
        value += character;
      }
      continue;
    }
    if (character === '"' && value.length === 0 && !closedQuote) {
      quoted = true;
    } else if (character === ',') {
      row.push(value);
      value = '';
      closedQuote = false;
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      value = '';
      closedQuote = false;
    } else {
      if (closedQuote && !/\s/.test(character)) {
        throw new Error('The CSV has unexpected text after a quoted value.');
      }
      if (!closedQuote) value += character;
    }
  }

  if (quoted) throw new Error('The CSV contains an unclosed quoted value.');
  row.push(value);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
};

const normalizeHeader = (header) => header
  .replace(/^\uFEFF/, '')
  .trim()
  .toLowerCase()
  .replace(/[\s-]+/g, '_');
const getField = (record, key) => String(record[key] || '');

const parseBoolean = (value, column) => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  if (['true', 'yes', '1'].includes(normalized)) return true;
  if (['false', 'no', '0'].includes(normalized)) return false;
  throw new Error(`${column} must be yes or no.`);
};

export const parseReadingCsv = (csvText) => {
  const source = String(csvText || '');
  if (new TextEncoder().encode(source).length > MAX_CSV_BYTES) {
    throw new Error('CSV must be no larger than 700 KB.');
  }
  const rows = parseRows(source);
  if (rows.length < 2) throw new Error('CSV needs a header row and at least one reading row.');

  const headers = rows[0].map(normalizeHeader);
  if (new Set(headers).size !== headers.length) throw new Error('CSV contains duplicate column names.');
  const requiredHeaders = ['title'];
  const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));
  if (missingHeaders.length) throw new Error(`Missing required column(s): ${missingHeaders.join(', ')}.`);

  const records = rows.slice(1).map((cells, rowIndex) => {
    if (cells.length > headers.length && cells.slice(headers.length).some((cell) => cell.trim())) {
      throw new Error(`Row ${rowIndex + 2} has more values than the header row.`);
    }
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] || '']));
  });
  const first = records[0];
  const sharedFields = [
    'title', 'original_text', 'subject_area', 'source_document', 'topic_tags', 'language', 'is_shared',
  ];
  for (const [index, record] of records.entries()) {
    for (const field of sharedFields) {
      if (getField(record, field).trim() && getField(record, field).trim() !== getField(first, field).trim()) {
        throw new Error(`Row ${index + 2} has a different ${field}; use one CSV per reading.`);
      }
    }
  }

  const title = getField(first, 'title').trim();
  const originalText = getField(first, 'original_text').replace(/^(?:\r\n|\r|\n)+|(?:\r\n|\r|\n)+$/g, '');
  const sections = [];
  const sectionOrders = new Set();
  for (const [index, record] of records.entries()) {
    const sectionText = getField(record, 'section_text').replace(/^(?:\r\n|\r|\n)+|(?:\r\n|\r|\n)+$/g, '');
    const sectionOrderValue = getField(record, 'section_order').trim();
    const sectionTitle = getField(record, 'section_title').trim();
    if (!sectionText && !sectionOrderValue && !sectionTitle) continue;
    if (!sectionText || !sectionOrderValue) {
      throw new Error(`Row ${index + 2}: section_order and section_text are required for a section row.`);
    }
    const order = Number(sectionOrderValue);
    if (!Number.isInteger(order) || order < 1 || order > MAX_SECTIONS) {
      throw new Error(`Row ${index + 2}: section_order must be a whole number from 1 to ${MAX_SECTIONS}.`);
    }
    if (sectionOrders.has(order)) throw new Error(`Row ${index + 2}: section_order ${order} is duplicated.`);
    sectionOrders.add(order);
    if (sectionTitle.length > 200) throw new Error(`Row ${index + 2}: section_title must be 200 characters or fewer.`);
    if (sectionText.length > 50000) throw new Error(`Row ${index + 2}: section_text must be 50,000 characters or fewer.`);
    sections.push({ order, title: sectionTitle, text: sectionText });
    if (sections.length > MAX_SECTIONS) throw new Error(`A reading can include no more than ${MAX_SECTIONS} sections.`);
  }
  sections.sort((a, b) => a.order - b.order);
  if (sections.some((section, index) => section.order !== index + 1)) {
    throw new Error('Section orders must start at 1 and have no gaps.');
  }
  if (sections.length && originalText.trim()) {
    throw new Error('Use either original_text or section_text rows, not both.');
  }
  const passageText = sections.length ? sections.map((section) => section.text).join('\n\n') : originalText;
  if (!title || !passageText.trim()) throw new Error('The first row must include the reading title and passage text or section text.');
  const vocabularyByTerm = new Map();
  for (const [index, record] of records.entries()) {
    const vocabularyWords = getField(record, 'vocabulary_words').split('|').map((word) => word.trim()).filter(Boolean);
    const vocabularyDefinitions = getField(record, 'vocabulary_definitions').split('|').map((definition) => definition.trim());
    const vocabularySimplifications = getField(record, 'vocabulary_simplifications').split('|').map((simple) => simple.trim());
    if (!vocabularyWords.length) {
      if (vocabularyDefinitions.some(Boolean) || vocabularySimplifications.some(Boolean)) {
        throw new Error(`Row ${index + 2}: add vocabulary_words for the supplied vocabulary definitions or simplifications.`);
      }
      continue;
    }
    if (vocabularyDefinitions.length !== vocabularyWords.length) {
      throw new Error(`Row ${index + 2}: add one vocabulary definition for each vocabulary word, in the same order.`);
    }
    const hasVocabularySimplifications = vocabularySimplifications.some(Boolean);
    if (hasVocabularySimplifications && vocabularySimplifications.length !== vocabularyWords.length) {
      throw new Error(`Row ${index + 2}: add one vocabulary simplification per word, or leave that column empty.`);
    }
    for (const [vocabularyIndex, original] of vocabularyWords.entries()) {
      if (!vocabularyDefinitions[vocabularyIndex]) {
        throw new Error(`Row ${index + 2}: add a definition for vocabulary item "${original}".`);
      }
      const normalized = original.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
      const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
      const isInPassage = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'u')
        .test(passageText.normalize('NFKC').toLocaleLowerCase());
      if (!isInPassage) throw new Error(`Vocabulary item "${original}" was not found in the passage.`);
      const substitution = {
        original,
        simple: hasVocabularySimplifications ? vocabularySimplifications[vocabularyIndex] : '',
        definition: vocabularyDefinitions[vocabularyIndex],
      };
      const existing = vocabularyByTerm.get(normalized);
      if (existing && (existing.definition !== substitution.definition || existing.simple !== substitution.simple)) {
        throw new Error(`Vocabulary item "${original}" has conflicting definitions in the CSV.`);
      }
      vocabularyByTerm.set(normalized, substitution);
    }
  }
  const vocabularySubstitutions = [...vocabularyByTerm.values()];
  if (vocabularySubstitutions.length > 30) throw new Error('A reading can include no more than 30 vocabulary words or phrases.');
  const questions = [];
  for (const [index, record] of records.entries()) {
    const type = getField(record, 'question_type').trim().toLowerCase().replace(/[\s-]+/g, '_');
    const question = getField(record, 'question').trim();
    if (!type && !question) continue;
    if (!type || !question) throw new Error(`Row ${index + 2}: question_type and question are both required.`);
    const order = getField(record, 'order').trim() ? Number(record.order) : questions.length + 1;
    if (!Number.isInteger(order) || order < 1) throw new Error(`Row ${index + 2}: order must be a positive whole number.`);

    if (['mcq', 'multiple_choice'].includes(type)) {
      const options = getField(record, 'options').split('|').map((option) => option.trim()).filter(Boolean);
      if (options.length < 2 || options.length > 6) {
        throw new Error(`Row ${index + 2}: MCQ options must contain 2 to 6 choices separated by |.`);
      }
      const answer = getField(record, 'correct_answer').trim().toLocaleLowerCase();
      const correctIndex = options.findIndex((option) => option.toLocaleLowerCase() === answer);
      if (correctIndex < 0) throw new Error(`Row ${index + 2}: correct_answer must exactly match one of the MCQ options.`);
      questions.push({ type: 'multiple_choice', question, options, correctIndex, order });
    } else if (['true_false', 'tf'].includes(type)) {
      const answer = getField(record, 'correct_answer').trim().toLowerCase();
      if (!['true', 'false'].includes(answer)) {
        throw new Error(`Row ${index + 2}: true/false correct_answer must be True or False.`);
      }
      questions.push({ type: 'true_false', question, correctAnswer: answer === 'true', order });
    } else if (['short_answer', 'short_response'].includes(type)) {
      questions.push({ type: 'short_answer', question, prompt: getField(record, 'prompt').trim(), order });
    } else {
      throw new Error(`Row ${index + 2}: question_type must be mcq, true_false, or short_answer.`);
    }
    if (questions.length > MAX_QUESTIONS) throw new Error(`A reading can include no more than ${MAX_QUESTIONS} questions.`);
  }

  return {
    title,
    originalText: passageText,
    sections,
    subjectArea: getField(first, 'subject_area').trim(),
    sourceDocument: getField(first, 'source_document').trim(),
    topicTags: getField(first, 'topic_tags').split('|').map((tag) => tag.trim()).filter(Boolean),
    language: getField(first, 'language').trim() || 'en',
    isShared: parseBoolean(getField(first, 'is_shared'), 'is_shared'),
    vocabularySubstitutions,
    questions,
  };
};

const csvCell = (value) => {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const buildReadingCsvTemplate = () => {
  const headers = [
    'title', 'original_text', 'section_order', 'section_title', 'section_text',
    'subject_area', 'source_document', 'topic_tags', 'language', 'is_shared',
    'vocabulary_words', 'vocabulary_simplifications', 'vocabulary_definitions',
    'question_type', 'question', 'prompt', 'options', 'correct_answer', 'order',
  ];
  const rows = [
    headers,
    [
      'The Brave Little Bird', '',
      '1', 'A Small Discovery', 'Mina found a small bird under a tree.',
      'English', 'Teacher-created', 'stories|comprehension', 'en', 'no',
      'shelter|gently', 'safe place|softly', 'a place that cares for animals|in a careful and kind way',
      'mcq', 'Where did Mina find the bird?', '', 'under a tree|in a classroom|beside a river', 'under a tree', '1',
    ],
    [
      '', '', '2', 'A Kind Choice', 'She gently carried it to the animal shelter.',
      '', '', '', '', '', '', '', '', 'true_false', 'Mina took the bird to an animal shelter.', '', '', 'True', '2',
    ],
    [
      '', '', '', '', '',
      '', '', '', '', '', '', '', '', 'short_answer', 'Why do you think Mina helped the bird?', 'Use a detail from the story.', '', '', '3',
    ],
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
};
