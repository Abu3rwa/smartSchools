const MAX_CSV_BYTES = 2 * 1024 * 1024;
const MAX_QUESTIONS = 30;

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
    throw new Error('CSV must be no larger than 2 MB.');
  }
  const rows = parseRows(source);
  if (rows.length < 2) throw new Error('CSV needs a header row and at least one reading row.');

  const headers = rows[0].map(normalizeHeader);
  if (new Set(headers).size !== headers.length) throw new Error('CSV contains duplicate column names.');
  const requiredHeaders = ['title', 'original_text'];
  const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));
  if (missingHeaders.length) throw new Error(`Missing required column(s): ${missingHeaders.join(', ')}.`);

  const records = rows.slice(1).map((cells, rowIndex) => {
    if (cells.length > headers.length && cells.slice(headers.length).some((cell) => cell.trim())) {
      throw new Error(`Row ${rowIndex + 2} has more values than the header row.`);
    }
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] || '']));
  });
  const first = records[0];
  const sharedFields = ['title', 'original_text', 'subject_area', 'source_document', 'topic_tags', 'language', 'is_shared'];
  for (const [index, record] of records.entries()) {
    for (const field of sharedFields) {
      if (record[field].trim() && record[field].trim() !== first[field].trim()) {
        throw new Error(`Row ${index + 2} has a different ${field}; use one CSV per reading.`);
      }
    }
  }

  const title = first.title.trim();
  const originalText = first.original_text.replace(/^(?:\r\n|\r|\n)+|(?:\r\n|\r|\n)+$/g, '');
  if (!title || !originalText.trim()) throw new Error('The first row must include the reading title and passage text.');
  const questions = [];
  for (const [index, record] of records.entries()) {
    const type = record.question_type.trim().toLowerCase().replace(/[\s-]+/g, '_');
    const question = record.question.trim();
    if (!type && !question) continue;
    if (!type || !question) throw new Error(`Row ${index + 2}: question_type and question are both required.`);
    const order = record.order.trim() ? Number(record.order) : questions.length + 1;
    if (!Number.isInteger(order) || order < 1) throw new Error(`Row ${index + 2}: order must be a positive whole number.`);

    if (['mcq', 'multiple_choice'].includes(type)) {
      const options = record.options.split('|').map((option) => option.trim()).filter(Boolean);
      if (options.length < 2 || options.length > 6) {
        throw new Error(`Row ${index + 2}: MCQ options must contain 2 to 6 choices separated by |.`);
      }
      const answer = record.correct_answer.trim().toLocaleLowerCase();
      const correctIndex = options.findIndex((option) => option.toLocaleLowerCase() === answer);
      if (correctIndex < 0) throw new Error(`Row ${index + 2}: correct_answer must exactly match one of the MCQ options.`);
      questions.push({ type: 'multiple_choice', question, options, correctIndex, order });
    } else if (['true_false', 'tf'].includes(type)) {
      const answer = record.correct_answer.trim().toLowerCase();
      if (!['true', 'false'].includes(answer)) {
        throw new Error(`Row ${index + 2}: true/false correct_answer must be True or False.`);
      }
      questions.push({ type: 'true_false', question, correctAnswer: answer === 'true', order });
    } else if (['short_answer', 'short_response'].includes(type)) {
      questions.push({ type: 'short_answer', question, prompt: record.prompt.trim(), order });
    } else {
      throw new Error(`Row ${index + 2}: question_type must be mcq, true_false, or short_answer.`);
    }
    if (questions.length > MAX_QUESTIONS) throw new Error(`A reading can include no more than ${MAX_QUESTIONS} questions.`);
  }

  return {
    title,
    originalText,
    subjectArea: first.subject_area.trim(),
    sourceDocument: first.source_document.trim(),
    topicTags: first.topic_tags.split('|').map((tag) => tag.trim()).filter(Boolean),
    language: first.language.trim() || 'en',
    isShared: parseBoolean(first.is_shared, 'is_shared'),
    questions,
  };
};

const csvCell = (value) => {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const buildReadingCsvTemplate = () => {
  const headers = [
    'title', 'original_text', 'subject_area', 'source_document', 'topic_tags', 'language', 'is_shared',
    'question_type', 'question', 'prompt', 'options', 'correct_answer', 'order',
  ];
  const rows = [
    headers,
    [
      'The Brave Little Bird',
      'Mina found a small bird under a tree.\n\nShe gently carried it to the animal shelter.',
      'English', 'Teacher-created', 'stories|comprehension', 'en', 'no',
      'mcq', 'Where did Mina find the bird?', '', 'under a tree|in a classroom|beside a river', 'under a tree', '1',
    ],
    ['', '', '', '', '', '', '', 'true_false', 'Mina took the bird to an animal shelter.', '', '', 'True', '2'],
    ['', '', '', '', '', '', '', 'short_answer', 'Why do you think Mina helped the bird?', 'Use a detail from the story.', '', '', '3'],
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
};
