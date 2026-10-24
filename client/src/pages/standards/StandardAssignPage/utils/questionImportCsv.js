export const CSV_HEADERS = [
    'question_type',
    'question_text',
    'option_a',
    'option_b',
    'option_c',
    'option_d',
    'option_e',
    'option_f',
    'correct_answer',
    'explanation',
    'difficulty',
    'matching_pairs',
    'ordering_items',
    'blank_answers',
    'numeric_rule',
    'passage_id',
    'passage_title',
    'passage_text'
];

export const MAX_IMPORT_ROWS = 100;
export const MAX_IMPORT_FILE_BYTES = 1024 * 1024;

const MC_LABELS = ['A', 'B', 'C', 'D'];
const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];
const ARABIC_LETTERS = { 'أ': 'A', 'ا': 'A', 'ب': 'B', 'ج': 'C', 'د': 'D' };
const TRUE_VALUES = ['true', 't', 'yes', 'صح', 'صحيح', 'صحيحة'];
const FALSE_VALUES = ['false', 'f', 'no', 'خطأ', 'خطا', 'خاطئ', 'خاطئة'];
const PAIR_SEPARATOR = '|';
const TERM_SEPARATOR = '::';
const ORDER_SEPARATOR = '>';
const MIN_MATCHING_PAIRS = 2;
const MIN_ORDER_ITEMS = 3;
const TYPE_ALIASES = {
    multiple_choice: 'multiple_choice',
    multiplechoice: 'multiple_choice',
    mcq: 'multiple_choice',
    mc: 'multiple_choice',
    'اختيار من متعدد': 'multiple_choice',
    true_false: 'true_false',
    truefalse: 'true_false',
    tf: 'true_false',
    'صح / خطأ': 'true_false',
    'صح/خطأ': 'true_false',
    'صح أو خطأ': 'true_false',
    short_answer: 'short_answer',
    shortanswer: 'short_answer',
    'short answer': 'short_answer',
    sa: 'short_answer',
    'إجابة قصيرة': 'short_answer',
    'اجابة قصيرة': 'short_answer',
    multiple_select: 'multiple_select',
    multipleselect: 'multiple_select',
    multi_select: 'multiple_select',
    multiselect: 'multiple_select',
    'اختيار متعدد': 'multiple_select',
    'اختيار من متعدد (كل الإجابات)': 'multiple_select',
    matching: 'matching',
    match: 'matching',
    'مطابقة': 'matching',
    ordering: 'ordering',
    order: 'ordering',
    sequence: 'ordering',
    'ترتيب': 'ordering',
    fill_in_blank: 'fill_in_blank',
    fillinblank: 'fill_in_blank',
    fill_blank: 'fill_in_blank',
    cloze: 'fill_in_blank',
    'fill in the blank': 'fill_in_blank',
    'أكمل الفراغ': 'fill_in_blank',
    'اكمل الفراغ': 'fill_in_blank',
    numeric_response: 'numeric_response',
    numeric: 'numeric_response',
    number: 'numeric_response',
    'إجابة رقمية': 'numeric_response',
    'اجابة رقمية': 'numeric_response'
};
const DIFFICULTY_ALIASES = {
    easy: 'easy',
    medium: 'medium',
    hard: 'hard',
    'سهل': 'easy',
    'متوسط': 'medium',
    'صعب': 'hard'
};

// Each objective type owns one CSV column that carries its authored definition.
const OBJECTIVE_DEFINITION_COLUMN = {
    matching: { column: 'matching_pairs', error: 'missingMatchingPairs' },
    ordering: { column: 'ordering_items', error: 'missingOrderingItems' },
    fill_in_blank: { column: 'blank_answers', error: 'missingBlankAnswers' },
    numeric_response: { column: 'numeric_rule', error: 'missingNumericRule' }
};

const escapeCell = (value) => {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const toCsvLine = (cells) => cells.map(escapeCell).join(',');

const blankRow = (cells) => CSV_HEADERS.map((header, index) => cells[index] ?? '');

const TEMPLATE_ROWS = [
    blankRow([
        'multiple_choice',
        'Which number is a prime number?',
        '4',
        '6',
        '7',
        '9',
        '',
        '',
        'C',
        '7 has only two factors: 1 and 7.',
        'easy'
    ]),
    blankRow([
        'multiple_choice',
        'What is 3/4 + 1/4?',
        '1',
        '4/8',
        '3/8',
        '2',
        '',
        '',
        'A',
        'The fractions share a denominator, so 3 + 1 = 4 and 4/4 = 1.',
        'medium'
    ]),
    blankRow([
        'true_false',
        'A triangle can have two right angles.',
        '',
        '',
        '',
        '',
        '',
        '',
        'False',
        'The angles of a triangle add up to 180 degrees.',
        'hard'
    ]),
    blankRow([
        'short_answer',
        'What do we call the process by which plants make their own food?',
        '',
        '',
        '',
        '',
        '',
        '',
        'Photosynthesis',
        'Plants use sunlight to make food.',
        'medium'
    ]),
    blankRow([
        'multiple_select',
        'Which of these are mammals?',
        'Whale',
        'Shark',
        'Bat',
        'Eagle',
        '',
        '',
        'A|C',
        'Whales and bats are mammals; sharks and eagles are not.',
        'medium'
    ]),
    blankRow([
        'matching',
        'Match each country to its capital.',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        'Capitals are cities, not countries.',
        'easy',
        'France::Paris|Kenya::Nairobi|Japan::Tokyo'
    ]),
    blankRow([
        'ordering',
        'Put the water cycle steps in order.',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        'Evaporation, then condensation, then precipitation, then collection.',
        'medium',
        '',
        'Evaporation>Condensation>Precipitation>Collection'
    ]),
    blankRow([
        'fill_in_blank',
        'The {{b1}} floated on the {{b2}}.',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        'Both blanks need at least one accepted answer.',
        'easy',
        '',
        '',
        'b1::leaf~leaves|b2::water~pond'
    ]),
    blankRow([
        'numeric_response',
        'A rectangle is 7 cm long and 4 cm wide. What is its perimeter in cm?',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        'Perimeter = 2 x (7 + 4) = 22.',
        'medium',
        '',
        '',
        '',
        'exact::22|unit::cm'
    ]),
    blankRow([
        'multiple_choice',
        'According to the passage, why did the keeper stay at the lighthouse?',
        'He was waiting for a ship',
        'He had to keep the light burning',
        'He could not find a boat',
        'He was hiding from the rain',
        '',
        '',
        'B',
        'The passage says the light had to stay burning through the storm.',
        'hard',
        '',
        '',
        '',
        '',
        'storm-light',
        'The Last Light',
        'The keeper stayed through the storm because the light had to keep burning for the ships.'
    ])
];

export const buildTemplateCsv = () =>
    [toCsvLine(CSV_HEADERS), ...TEMPLATE_ROWS.map(toCsvLine)].join('\r\n');

const AI_RULES = [
    'You are an expert teacher and assessment writer.',
    'Write {count} assessment questions for the following context:',
    '- Subject: {subject}',
    '- Grade level: {grade}',
    '- Standard: {standard}',
    '- Language of the questions, options and explanations: {language}',
    '',
    'Output rules (follow exactly):',
    '1. Output ONLY CSV text. No markdown, no code fences, no commentary before or after.',
    '2. The first line must be exactly this header: {headers}',
    '3. One question per line. Wrap any field that contains a comma, quote or line break in double quotes, and double any inner quote.',
    '4. question_type must be one of: multiple_choice, true_false, short_answer, multiple_select, matching, ordering, fill_in_blank, numeric_response.',
    '5. For multiple_choice: fill option_a to option_d with four different options and set correct_answer to A, B, C or D.',
    '6. For true_false: leave every option empty and set correct_answer to True or False.',
    '7. For short_answer: leave every option empty and set correct_answer to one or two words that fully answer the question.',
    '8. For multiple_select: fill option_a to option_f with 2 to 6 different options and set correct_answer to every correct label separated by |, for example A|C.',
    '9. For matching: leave every option and correct_answer empty and set matching_pairs to term::definition pairs separated by |, for example France::Paris|Kenya::Nairobi.',
    '10. For ordering: leave every option and correct_answer empty and set ordering_items to the steps in the correct order separated by >.',
    '11. For fill_in_blank: write the blank positions inside question_text as {{b1}} and {{b2}}, then set blank_answers to b1::answer~alsoAccepted|b2::answer for every blank.',
    '12. For numeric_response: leave every option and correct_answer empty and set numeric_rule to exact::value, tolerance::value~plusOrMinus, range::low~high or relative::value~percent, optionally |unit::cm and |decimals::2.',
    '13. For a question that must be answered from a text, fill passage_id, passage_title and passage_text. Reuse one passage_id for every question that reads the same text, and never reuse it for different text.',
    '14. explanation: one short sentence explaining the correct answer.',
    '15. difficulty must be easy, medium or hard. Mix the difficulties.',
    '16. Every question must clearly assess the standard above and suit the grade level. Do not repeat questions.',
    '',
    'Example rows:',
    '{exampleHeader}',
    '{examples}'
].join('\n');

const AI_EXAMPLE_ROWS = [
    ['multiple_choice', 'Which number is a prime number?', '4', '6', '7', '9', '', '', 'C', '7 has only two factors: 1 and 7.', 'easy'],
    ['true_false', 'A triangle can have two right angles.', '', '', '', '', '', '', 'False', 'The angles of a triangle add up to 180 degrees.', 'hard'],
    ['multiple_select', 'Which of these are mammals?', 'Whale', 'Shark', 'Bat', 'Eagle', '', '', 'A|C', 'Whales and bats are mammals.', 'medium'],
    ['matching', 'Match each country to its capital.', '', '', '', '', '', '', '', 'Capitals are cities.', 'easy', 'France::Paris|Kenya::Nairobi|Japan::Tokyo'],
    ['ordering', 'Put the water cycle steps in order.', '', '', '', '', '', '', '', 'Water rises, forms clouds, falls and collects.', 'medium', '', 'Evaporation>Condensation>Precipitation>Collection'],
    ['fill_in_blank', 'The {{b1}} floated on the {{b2}}.', '', '', '', '', '', '', '', 'A leaf floats on water.', 'easy', '', '', 'b1::leaf~leaves|b2::water~pond'],
    ['numeric_response', 'A rectangle is 7 cm long and 4 cm wide. What is its perimeter in cm?', '', '', '', '', '', '', '', 'Perimeter = 2 x (7 + 4) = 22.', 'medium', '', '', '', 'exact::22|unit::cm']
].map(toCsvLine).join('\n');

export const buildAiPrompt = ({    subject,
    grade,
    standardCode,
    standardName,
    count = 10,
    languageName = 'English'
}) => {
    const standardLine = [standardCode, standardName].filter(Boolean).join(' - ');
    return AI_RULES
        .replace('{count}', String(count))
        .replace('{subject}', subject || 'N/A')
        .replace('{grade}', grade || 'N/A')
        .replace('{standard}', standardLine || 'N/A')
        .replace('{language}', languageName)
        .replace('{headers}', CSV_HEADERS.join(','))
        .replace('{exampleHeader}', toCsvLine(CSV_HEADERS))
        .replace('{examples}', AI_EXAMPLE_ROWS);
};

const detectDelimiter = (text) => {
    const firstLine = text.split(/\r?\n/, 1)[0] || '';
    const counts = [',', ';', '\t'].map((delimiter) => ({
        delimiter,
        count: firstLine.split(delimiter).length - 1
    }));
    counts.sort((a, b) => b.count - a.count);
    return counts[0].count > 0 ? counts[0].delimiter : ',';
};

export const parseCsv = (rawText) => {
    const text = String(rawText || '').replace(/^\uFEFF/, '');
    const delimiter = detectDelimiter(text);
    const rows = [];
    let row = [];
    let cell = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        if (inQuotes) {
            if (char === '"') {
                if (text[i + 1] === '"') {
                    cell += '"';
                    i += 1;
                } else {
                    inQuotes = false;
                }
            } else {
                cell += char;
            }
            continue;
        }
        if (char === '"') {
            inQuotes = true;
        } else if (char === delimiter) {
            row.push(cell);
            cell = '';
        } else if (char === '\n' || char === '\r') {
            if (char === '\r' && text[i + 1] === '\n') i += 1;
            row.push(cell);
            rows.push(row);
            row = [];
            cell = '';
        } else {
            cell += char;
        }
    }
    if (cell !== '' || row.length > 0) {
        row.push(cell);
        rows.push(row);
    }

    return rows.filter((cells) => cells.some((value) => String(value).trim() !== ''));
};

const normalizeHeader = (value) =>
    String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_');

const normalizeKey = (value) => String(value || '').trim().toLowerCase();

const countSegments = (value, separator) => String(value || '')
    .split(separator)
    .map((part) => part.trim())
    .filter(Boolean).length;

/**
 * Parses CSV text into rows with per-row validation.
 * Error entries are { code, params } so the UI can translate them.
 * Returns { rows, fatal } where fatal is a translation code or null.
 */
export const parseQuestionImport = (rawText) => {
    const records = parseCsv(rawText);
    if (records.length === 0) return { rows: [], fatal: 'empty' };

    const headers = records[0].map(normalizeHeader);
    const missingHeaders = ['question_text', 'correct_answer'].filter(
        (name) => !headers.includes(name)
    );
    if (missingHeaders.length > 0) {
        return { rows: [], fatal: 'missingHeaders', fatalParams: { columns: missingHeaders.join(', ') } };
    }

    const dataRecords = records.slice(1);
    if (dataRecords.length === 0) return { rows: [], fatal: 'noRows' };
    if (dataRecords.length > MAX_IMPORT_ROWS) {
        return { rows: [], fatal: 'tooManyRows', fatalParams: { max: MAX_IMPORT_ROWS } };
    }

    const get = (record, name) => {
        const index = headers.indexOf(name);
        return index >= 0 ? String(record[index] ?? '').trim() : '';
    };

    const seen = new Set();
    const rows = dataRecords.map((record, index) => {
        const errors = [];
        const questionText = get(record, 'question_text');
        const rawType = normalizeKey(get(record, 'question_type'));
        const rawAnswer = get(record, 'correct_answer');
        const rawDifficulty = normalizeKey(get(record, 'difficulty'));
        const explanation = get(record, 'explanation');

        const optionTexts = OPTION_LABELS.map((letter) => get(record, `option_${letter.toLowerCase()}`));
        let questionType = TYPE_ALIASES[rawType];
        if (!questionType) {
            if (!rawType) {
                const filled = optionTexts.filter(Boolean).length;
                if (filled > 0) {
                    questionType = 'multiple_choice';
                } else if (
                    TRUE_VALUES.concat(FALSE_VALUES).includes(normalizeKey(rawAnswer))
                ) {
                    questionType = 'true_false';
                } else {
                    questionType = 'short_answer';
                }
            } else {
                errors.push({ code: 'badType' });
                questionType = 'multiple_choice';
            }
        }

        const difficulty = rawDifficulty ? DIFFICULTY_ALIASES[rawDifficulty] : 'medium';
        if (!difficulty) errors.push({ code: 'badDifficulty' });

        if (!questionText) errors.push({ code: 'missingQuestion' });

        let options = [];
        let correctAnswer = '';
        const definition = {};
        const objective = OBJECTIVE_DEFINITION_COLUMN[questionType];

        if (questionType === 'multiple_choice') {
            options = MC_LABELS.map((label, optionIndex) => ({
                label,
                text: optionTexts[optionIndex]
            }));
            if (options.some((option) => !option.text)) {
                errors.push({ code: 'missingOptions' });
            } else if (new Set(options.map((option) => option.text)).size < 4) {
                errors.push({ code: 'duplicateOptions' });
            }
            const letter = rawAnswer.toUpperCase();
            correctAnswer = MC_LABELS.includes(letter) ? letter : ARABIC_LETTERS[rawAnswer] || '';
            if (!correctAnswer) errors.push({ code: 'badCorrectMc' });
        } else if (questionType === 'true_false') {
            options = [
                { label: 'A', text: 'True' },
                { label: 'B', text: 'False' }
            ];
            const key = normalizeKey(rawAnswer);
            if (TRUE_VALUES.includes(key)) correctAnswer = 'True';
            else if (FALSE_VALUES.includes(key)) correctAnswer = 'False';
            else errors.push({ code: 'badCorrectTf' });
        } else if (questionType === 'multiple_select') {
            options = OPTION_LABELS.map((label, optionIndex) => ({
                label,
                text: optionTexts[optionIndex]
            })).filter((option) => option.text);
            if (options.length < 2) errors.push({ code: 'missingOptions' });
            if (new Set(options.map((option) => option.text.toLowerCase())).size < options.length) {
                errors.push({ code: 'duplicateOptions' });
            }
            correctAnswer = rawAnswer
                .split(PAIR_SEPARATOR)
                .map((entry) => entry.trim().toUpperCase())
                .filter(Boolean)
                .join(PAIR_SEPARATOR);
            if (countSegments(correctAnswer, PAIR_SEPARATOR) < 2) {
                errors.push({ code: 'badCorrectMultiSelect' });
            } else if (correctAnswer.split(PAIR_SEPARATOR).some((label) => !options.some((option) => option.label === label))) {
                errors.push({ code: 'badCorrectMultiSelect' });
            }
        } else if (objective) {
            const value = get(record, objective.column);
            definition[objective.column] = value;
            if (!value) {
                errors.push({ code: objective.error, params: { column: objective.column } });
            } else if (questionType === 'matching' && countSegments(value, PAIR_SEPARATOR) < MIN_MATCHING_PAIRS) {
                errors.push({ code: 'tooFewMatchingPairs', params: { min: MIN_MATCHING_PAIRS } });
            } else if (questionType === 'ordering' && countSegments(value, ORDER_SEPARATOR) < MIN_ORDER_ITEMS) {
                errors.push({ code: 'tooFewOrderItems', params: { min: MIN_ORDER_ITEMS } });
            } else if (questionType === 'fill_in_blank') {
                const tokens = (questionText.match(/\{\{\s*(?:blank:)?\s*([A-Za-z0-9_-]+)\s*\}\}/g) || []).length;
                if (!tokens) errors.push({ code: 'missingBlankTokens' });
                else if (countSegments(value, PAIR_SEPARATOR) !== tokens) errors.push({ code: 'blankCountMismatch' });
            }
            // The authored definition is the answer for these types, so correct_answer stays empty.
            correctAnswer = rawAnswer;
        } else {
            options = [];
            // No accepted-answer list in the CSV template, so these are graded by
            // the teacher unless they add accepted answers in the editor.
            correctAnswer = rawAnswer;
            if (!correctAnswer) errors.push({ code: 'missingAnswer' });
        }

        const passageId = get(record, 'passage_id');
        const passageTitle = get(record, 'passage_title');
        const passageText = get(record, 'passage_text');
        if (passageText && !passageId) errors.push({ code: 'missingPassageId' });

        if (questionText) {
            // Options compare case-sensitively because capitalization questions
            // differ only by case; the stem stays case-insensitive.
            const optionSignature = options
                .map((option) => option.text)
                .filter(Boolean)
                .sort()
                .join('|');
            const duplicateKey = [
                questionType,
                questionText.toLowerCase(),
                optionSignature,
                ...Object.values(definition)
            ].join('|');
            if (seen.has(duplicateKey)) errors.push({ code: 'duplicateQuestion' });
            seen.add(duplicateKey);
        }

        return {
            line: index + 2,
            errors,
            question: {
                questionText,
                questionType,
                options,
                correctAnswer,
                explanation,
                difficulty: difficulty || 'medium',
                ...definition,
                ...(passageText ? { passageId, passageTitle, passageText } : {})
            }
        };
    });

    return { rows, fatal: null };
};
