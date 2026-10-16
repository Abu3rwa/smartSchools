import { parseCsv } from '../../../standards/StandardAssignPage/utils/questionImportCsv.js';

const MAX_IMPORT_ROWS = 100;
const MAX_IMPORT_FILE_BYTES = 1024 * 1024;
const QUESTION_TYPES = new Set(['multiple_choice', 'true_false', 'short_answer']);
const TYPE_ALIASES = {
    multiple_choice: 'multiple_choice',
    multiplechoice: 'multiple_choice',
    mcq: 'multiple_choice',
    mc: 'multiple_choice',
    true_false: 'true_false',
    truefalse: 'true_false',
    tf: 'true_false',
    short_answer: 'short_answer',
    shortanswer: 'short_answer',
    sa: 'short_answer'
};
const OPTION_COLUMNS = 'abcdefghijklmnopqrst'.split('').map((letter) => `option_${letter}`);

const normalizeHeader = (value) => String(value || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

const escapeCell = (value) => {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const buildGoogleFormQuestionCsvTemplate = () => {
    const rows = [
        ['question_type', 'question_text', 'options', 'correct_answer', 'points'],
        ['multiple_choice', 'Which number is even?', '3|4|5|7', '4', '1'],
        ['true_false', 'A triangle has three sides.', '', 'True', '1'],
        ['short_answer', 'Explain one way to help your community.', '', '', '0']
    ];
    return `\uFEFF${rows.map((row) => row.map(escapeCell).join(',')).join('\r\n')}\r\n`;
};

const resolveCorrectAnswer = (rawAnswer, options, optionValues) => {
    const answer = String(rawAnswer || '').trim();
    if (optionValues.length) {
        const labelIndex = 'abcdefghijklmnopqrst'.indexOf(answer.toLowerCase());
        if (labelIndex >= 0 && labelIndex < optionValues.length) return optionValues[labelIndex];
    }
    return options.find((option) => option.toLowerCase() === answer.toLowerCase()) || answer;
};

export const parseGoogleFormQuestionCsv = (csvText) => {
    const records = parseCsv(String(csvText || ''));
    if (records.length < 2) throw new Error('The CSV must include a header and at least one question.');

    const headers = records[0].map(normalizeHeader);
    if (headers.some((header) => !header)) throw new Error('The CSV header contains an empty column name.');
    if (new Set(headers).size !== headers.length) throw new Error('The CSV contains duplicate column names.');
    if (!headers.includes('question_text') && !headers.includes('question')) {
        throw new Error('The CSV must include a question_text column.');
    }
    if (records.length - 1 > MAX_IMPORT_ROWS) {
        throw new Error(`The CSV can contain no more than ${MAX_IMPORT_ROWS} questions.`);
    }

    const get = (record, name) => {
        const columnIndex = headers.indexOf(name);
        return columnIndex < 0 ? '' : String(record[columnIndex] ?? '').trim();
    };

    return records.slice(1).map((record, index) => {
        const rowNumber = index + 2;
        if (record.length > headers.length && record.slice(headers.length).some((cell) => String(cell).trim())) {
            throw new Error(`Row ${rowNumber} has more values than the CSV header.`);
        }

        const title = get(record, headers.includes('question_text') ? 'question_text' : 'question');
        const rawType = get(record, 'question_type') || get(record, 'type');
        const optionColumnNames = OPTION_COLUMNS.filter((name) => headers.includes(name));
        const optionValues = optionColumnNames.map((name) => get(record, name));
        const labeledOptions = optionValues.filter(Boolean);
        const packedOptions = get(record, 'options');
        const options = labeledOptions.length
            ? labeledOptions
            : packedOptions.split('|').map((option) => option.trim()).filter(Boolean);

        const normalizedType = rawType.trim().toLowerCase().replace(/[\s-]+/g, '_');
        let type = rawType
            ? TYPE_ALIASES[normalizedType] || TYPE_ALIASES[normalizedType.replace(/_/g, '')]
            : '';
        if (!type && !rawType) {
            type = options.length > 0
                ? 'multiple_choice'
                : (get(record, 'correct_answer').trim() ? 'true_false' : 'short_answer');
        }
        if (!QUESTION_TYPES.has(type)) {
            throw new Error(`Row ${rowNumber} has an unsupported question_type.`);
        }
        if (!title || title.length > 1000) {
            throw new Error(`Row ${rowNumber} needs a question between 1 and 1000 characters.`);
        }

        if (type === 'short_answer') {
            const points = get(record, 'points');
            if (points && (!Number.isInteger(Number(points)) || Number(points) !== 0)) {
                throw new Error(`Row ${rowNumber}: short-answer questions must have 0 points.`);
            }
            return { type, title, options: [], correctAnswer: '', points: 0 };
        }

        const pointsValue = get(record, 'points') || '1';
        const points = Number(pointsValue);
        if (!Number.isInteger(points) || points < 1 || points > 1000) {
            throw new Error(`Row ${rowNumber} points must be a whole number from 1 to 1000.`);
        }

        if (type === 'true_false') {
            const correctAnswer = get(record, 'correct_answer').toLowerCase();
            if (!['true', 'false'].includes(correctAnswer)) {
                throw new Error(`Row ${rowNumber} must have True or False as the correct_answer.`);
            }
            return { type, title, options: ['True', 'False'], correctAnswer: correctAnswer === 'true' ? 'True' : 'False', points };
        }

        if (options.length < 2 || options.length > 20 || options.some((option) => option.length > 500)) {
            throw new Error(`Row ${rowNumber} must have 2 to 20 answer options, each no more than 500 characters.`);
        }
        if (new Set(options.map((option) => option.toLowerCase())).size !== options.length) {
            throw new Error(`Row ${rowNumber} contains duplicate answer options.`);
        }
        const correctAnswer = resolveCorrectAnswer(
            get(record, 'correct_answer'),
            options,
            optionValues
        );
        if (!options.includes(correctAnswer)) {
            throw new Error(`Row ${rowNumber} correct_answer must match an option or its option letter.`);
        }
        return { type, title, options, correctAnswer, points };
    });
};

export { MAX_IMPORT_FILE_BYTES };
