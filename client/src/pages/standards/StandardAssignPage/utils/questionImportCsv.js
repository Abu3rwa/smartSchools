export const CSV_HEADERS = [
    'question_type',
    'question_text',
    'option_a',
    'option_b',
    'option_c',
    'option_d',
    'correct_answer',
    'explanation',
    'difficulty'
];

export const MAX_IMPORT_ROWS = 100;
export const MAX_IMPORT_FILE_BYTES = 1024 * 1024;

const MC_LABELS = ['A', 'B', 'C', 'D'];
const ARABIC_LETTERS = { 'أ': 'A', 'ا': 'A', 'ب': 'B', 'ج': 'C', 'د': 'D' };
const TRUE_VALUES = ['true', 't', 'yes', 'صح', 'صحيح', 'صحيحة'];
const FALSE_VALUES = ['false', 'f', 'no', 'خطأ', 'خطا', 'خاطئ', 'خاطئة'];
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
    'صح أو خطأ': 'true_false'
};
const DIFFICULTY_ALIASES = {
    easy: 'easy',
    medium: 'medium',
    hard: 'hard',
    'سهل': 'easy',
    'متوسط': 'medium',
    'صعب': 'hard'
};

const escapeCell = (value) => {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const toCsvLine = (cells) => cells.map(escapeCell).join(',');

export const buildTemplateCsv = () =>
    [
        toCsvLine(CSV_HEADERS),
        toCsvLine([
            'multiple_choice',
            'Which number is a prime number?',
            '4',
            '6',
            '7',
            '9',
            'C',
            '7 has only two factors: 1 and 7.',
            'easy'
        ]),
        toCsvLine([
            'multiple_choice',
            'What is 3/4 + 1/4?',
            '1',
            '4/8',
            '3/8',
            '2',
            'A',
            'The fractions share a denominator, so 3 + 1 = 4 and 4/4 = 1.',
            'medium'
        ]),
        toCsvLine([
            'true_false',
            'A triangle can have two right angles.',
            '',
            '',
            '',
            '',
            'False',
            'The angles of a triangle add up to 180 degrees.',
            'hard'
        ])
    ].join('\r\n');

export const buildAiPrompt = ({
    subject,
    grade,
    standardCode,
    standardName,
    count = 10,
    languageName = 'English'
}) => {
    const standardLine = [standardCode, standardName].filter(Boolean).join(' - ');
    return [
        'You are an expert teacher and assessment writer.',
        `Write ${count} assessment questions for the following context:`,
        `- Subject: ${subject || 'N/A'}`,
        `- Grade level: ${grade || 'N/A'}`,
        `- Standard: ${standardLine || 'N/A'}`,
        `- Language of the questions, options and explanations: ${languageName}`,
        '',
        'Output rules (follow exactly):',
        `1. Output ONLY CSV text. No markdown, no code fences, no commentary before or after.`,
        `2. The first line must be exactly this header: ${CSV_HEADERS.join(',')}`,
        '3. One question per line. Wrap any field that contains a comma, quote or line break in double quotes, and double any inner quote.',
        '4. question_type must be multiple_choice or true_false.',
        '5. For multiple_choice: fill option_a to option_d with four different options and set correct_answer to A, B, C or D.',
        '6. For true_false: leave option_a to option_d empty and set correct_answer to True or False.',
        '7. explanation: one short sentence explaining the correct answer.',
        '8. difficulty must be easy, medium or hard. Mix the difficulties.',
        '9. Every question must clearly assess the standard above and suit the grade level. Do not repeat questions.',
        '',
        'Example rows:',
        toCsvLine(CSV_HEADERS),
        toCsvLine([
            'multiple_choice',
            'Which number is a prime number?',
            '4',
            '6',
            '7',
            '9',
            'C',
            '7 has only two factors: 1 and 7.',
            'easy'
        ]),
        toCsvLine([
            'true_false',
            'A triangle can have two right angles.',
            '',
            '',
            '',
            '',
            'False',
            'The angles of a triangle add up to 180 degrees.',
            'hard'
        ])
    ].join('\n');
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

        const optionTexts = ['a', 'b', 'c', 'd'].map((letter) => get(record, `option_${letter}`));
        let questionType = TYPE_ALIASES[rawType];
        if (!questionType) {
            if (!rawType) {
                const filled = optionTexts.filter(Boolean).length;
                questionType = filled === 0 && FALSE_VALUES.concat(TRUE_VALUES).includes(normalizeKey(rawAnswer))
                    ? 'true_false'
                    : 'multiple_choice';
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

        if (questionType === 'multiple_choice') {
            options = MC_LABELS.map((label, optionIndex) => ({
                label,
                text: optionTexts[optionIndex]
            }));
            if (options.some((option) => !option.text)) {
                errors.push({ code: 'missingOptions' });
            } else if (new Set(options.map((option) => option.text.toLowerCase())).size < 4) {
                errors.push({ code: 'duplicateOptions' });
            }
            const letter = rawAnswer.toUpperCase();
            correctAnswer = MC_LABELS.includes(letter) ? letter : ARABIC_LETTERS[rawAnswer] || '';
            if (!correctAnswer) errors.push({ code: 'badCorrectMc' });
        } else {
            options = [
                { label: 'A', text: 'True' },
                { label: 'B', text: 'False' }
            ];
            const key = normalizeKey(rawAnswer);
            if (TRUE_VALUES.includes(key)) correctAnswer = 'True';
            else if (FALSE_VALUES.includes(key)) correctAnswer = 'False';
            else errors.push({ code: 'badCorrectTf' });
        }

        if (questionText) {
            const duplicateKey = `${questionType}|${questionText.toLowerCase()}`;
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
                difficulty: difficulty || 'medium'
            }
        };
    });

    return { rows, fatal: null };
};
