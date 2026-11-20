// Structured CSV import for SkillPath packs. No AI runs here.
// Two contracts share one validator:
//  - single: the destination skill/pack is chosen in the dialog, so the file
//    has no pack_key/skill_key columns and never decides where rows land.
//  - bulk: the legacy stable-key file (pack_key + external_id) for advanced
//    multi-pack imports, with explicit mappings chosen before commit.
// Every type uses the shared practice grammar: | separates pairs/keys,
// :: separates term from match, > separates ordered items, ~ separates
// accepted variants and numeric tolerances.
import { parseCsvRecords, toCsv } from '../utils/vocabCsv.js';
import { resolvePracticeQuestionType } from '../constants/practiceQuestionTypes.js';
import { validateGameItem, ITEM_LIMITS } from './languageGameItems.js';

export const PACK_LIMITS = Object.freeze({
    maxItems: 2000,
    maxBytes: 5 * 1024 * 1024
});

export const LANGUAGES = ['en', 'ar', 'mixed'];

const CORE_HEADERS = [
    'pack_key', 'pack_title', 'external_id', 'language', 'grade_levels',
    'skill_key', 'skill_name', 'standard_codes', 'prompt'
];
const COMMON_TAIL = ['explanation', 'difficulty'];
const OPTION_COLUMNS = ['option_1', 'option_2', 'option_3', 'option_4', 'option_5', 'option_6'];
const LEGACY_ANSWER_HEADERS = [...OPTION_COLUMNS, 'correct_option', 'answer', 'accepted_answers'];
// Mixed files choose a type per row, so every answer column ships at once and
// only the columns that type needs are read.
const MIXED_ANSWER_HEADERS = [
    ...OPTION_COLUMNS, 'correct_option', 'correct_answer', 'answer', 'accepted_answers',
    'matching_pairs', 'ordering_items', 'numeric_rule'
];

const SINGLE_HEADERS = {
    multiple_choice: ['external_id', 'prompt', ...LEGACY_ANSWER_HEADERS, 'standard_codes', ...COMMON_TAIL],
    fill_in_blank: ['external_id', 'prompt', ...LEGACY_ANSWER_HEADERS, 'standard_codes', ...COMMON_TAIL],
    true_false: ['external_id', 'prompt', 'correct_answer', 'standard_codes', ...COMMON_TAIL],
    multiple_select: ['external_id', 'prompt', ...OPTION_COLUMNS, 'correct_answer', 'standard_codes', ...COMMON_TAIL],
    matching: ['external_id', 'prompt', 'matching_pairs', 'standard_codes', ...COMMON_TAIL],
    ordering: ['external_id', 'prompt', 'ordering_items', 'standard_codes', ...COMMON_TAIL],
    numeric_response: ['external_id', 'prompt', 'numeric_rule', 'standard_codes', ...COMMON_TAIL],
    mixed: ['external_id', 'type', 'prompt', ...MIXED_ANSWER_HEADERS, 'standard_codes', ...COMMON_TAIL]
};

const BULK_ANSWER_HEADERS = {
    multiple_choice: LEGACY_ANSWER_HEADERS,
    fill_in_blank: LEGACY_ANSWER_HEADERS,
    true_false: ['correct_answer'],
    multiple_select: [...OPTION_COLUMNS, 'correct_answer'],
    matching: ['matching_pairs'],
    ordering: ['ordering_items'],
    numeric_response: ['numeric_rule'],
    mixed: MIXED_ANSWER_HEADERS
};

const SINGLE_REQUIRED = {
    multiple_choice: ['prompt', 'correct_option'],
    fill_in_blank: ['prompt', 'answer'],
    true_false: ['prompt', 'correct_answer'],
    multiple_select: ['prompt', 'correct_answer'],
    matching: ['prompt', 'matching_pairs'],
    ordering: ['prompt', 'ordering_items'],
    numeric_response: ['prompt', 'numeric_rule'],
    mixed: ['prompt', 'type']
};

const SINGLE_EXAMPLES = {
    multiple_choice: [
        ['U3-001', 'Which word means "not happy"?', 'unhappy', 'unhappily', 'happy', 'happiness', '', '', '1', '', '', '', 'un- changes the meaning to "not".', '1'],
        ['U3-002', 'Which word means "not kind"?', 'unkind', 'kindness', 'kindly', 'kinder', '', '', '1', '', '', '', 'un- + kind = not kind.', '1']
    ],
    fill_in_blank: [
        ['T-001', 'Add the prefix un- to "happy": ___', '', '', '', '', '', '', '', 'unhappy', 'un happy', '', 'un- means "not", so unhappy means not happy.', '1'],
        ['T-002', 'Add the prefix un- to "kind": ___', '', '', '', '', '', '', '', 'unkind', '', '', 'un- + kind = unkind.', '1']
    ],
    true_false: [
        ['TF-001', 'A triangle has three sides.', 'true', '', 'Three sides and three angles make a triangle.', '1'],
        ['TF-002', 'Water boils at 50°C at sea level.', 'false', '', 'At sea level water boils at 100°C.', '1']
    ],
    multiple_select: [
        ['MS-001', 'Select all even numbers.', '2', '4', '7', '9', '', '', '1|2', '', 'Even numbers divide by 2 with no remainder.', '1'],
        ['MS-002', 'Select all mammals.', 'Dolphin', 'Bat', 'Shark', 'Trout', '', '', '1|2', '', 'Mammals feed their young milk; sharks and trout are fish.', '2']
    ],
    matching: [
        ['M-001', 'Match each planet to its position from the Sun.', 'Mercury::1|Venus::2|Earth::3', '', 'Positions count outward from the Sun.', '2'],
        ['M-002', 'Match each word to its meaning.', 'happy::glad|sad::unhappy|fast::quick', '', 'Each word pairs with a word of the same meaning.', '1']
    ],
    ordering: [
        ['O-001', 'Order the parts of the day from earliest to latest.', 'Sunrise > Noon > Sunset', '', 'The Sun rises, reaches its highest point, then sets.', '1'],
        ['O-002', 'Order these numbers from smallest to largest.', '0.25 > 0.5 > 0.75 > 1', '', 'A quarter, a half, three quarters, then one whole.', '2']
    ],
    numeric_response: [
        ['N-001', 'What is 12 × 12?', '144', '', '12 groups of 12 make 144.', '1'],
        ['N-002', 'Estimate pi to two decimal places.', 'tolerance::3.14~0.01', '', 'Pi is about 3.14159, so 3.14 is within 0.01.', '2']
    ],
    mixed: [
        ['MX-001', 'multiple_choice', 'Which word means "not happy"?', 'unhappy', 'happy', '', '', '', '', '1', '', '', '', '', '', '', '', 'un- changes the meaning to "not".', '1'],
        ['MX-002', 'fill_in_blank', 'Add the prefix un- to "kind": ___', '', '', '', '', '', '', '', '', 'unkind', 'un kind', '', '', '', '', 'un- + kind = unkind.', '1'],
        ['MX-003', 'true_false', 'The prefix un- means "not".', '', '', '', '', '', '', '', 'true', '', '', '', '', '', '', 'un- changes the meaning to "not".', '1']
    ]
};

const BULK_EXAMPLES = {
    multiple_choice: [
        ['prefix-un-g5', 'Grade 5 Prefixes — Unit 3', 'U3-001', 'en', '5', 'prefix-un', '', '', 'Which word means "not happy"?', 'unhappy', 'unhappily', 'happy', 'happiness', '', '', '1', '', '', 'un- changes the meaning to "not".', '1'],
        ['prefix-un-g5', 'Grade 5 Prefixes — Unit 3', 'U3-002', 'en', '5', 'prefix-un', '', '', 'Which word means "not kind"?', 'unkind', 'kindness', 'kindly', 'kinder', '', '', '1', '', '', 'un- + kind = not kind.', '1']
    ],
    fill_in_blank: [
        ['prefix-un-g5-typing', 'Grade 5 Prefixes — Typed answers', 'T-001', 'en', '5', 'prefix-un', '', '', 'Add the prefix un- to "happy": ___', '', '', '', '', '', '', '', 'unhappy', 'un happy', 'un- means "not", so unhappy means not happy.', '1'],
        ['prefix-un-g5-typing', 'Grade 5 Prefixes — Typed answers', 'T-002', 'en', '5', 'prefix-un', '', '', 'Add the prefix un- to "kind": ___', '', '', '', '', '', '', '', 'unkind', '', 'un- + kind = unkind.', '1']
    ],
    true_false: [
        ['shapes-g3', 'Grade 3 Shapes', 'TF-001', 'en', '3', 'shapes', '', '', 'A triangle has three sides.', 'true', 'Three sides and three angles make a triangle.', '1'],
        ['shapes-g3', 'Grade 3 Shapes', 'TF-002', 'en', '3', 'shapes', '', '', 'A square has five sides.', 'false', 'A square has four equal sides.', '1']
    ],
    multiple_select: [
        ['numbers-g4', 'Grade 4 Number Sense', 'MS-001', 'en', '4', 'even-odd', '', '', 'Select all even numbers.', '2', '4', '7', '9', '', '', '1|2', 'Even numbers divide by 2 with no remainder.', '1'],
        ['numbers-g4', 'Grade 4 Number Sense', 'MS-002', 'en', '4', 'even-odd', '', '', 'Select all multiples of 5.', '10', '25', '32', '45', '', '', '1|2|4', 'Multiples of 5 end in 0 or 5.', '2']
    ],
    matching: [
        ['space-g5', 'Grade 5 Space', 'M-001', 'en', '5', 'planets', '', '', 'Match each planet to its position from the Sun.', 'Mercury::1|Venus::2|Earth::3', 'Positions count outward from the Sun.', '2'],
        ['space-g5', 'Grade 5 Space', 'M-002', 'en', '5', 'planets', '', '', 'Match each planet to its nickname.', 'Mars::Red Planet|Venus::Morning Star|Saturn::Ringed Planet', 'Nicknames come from color, brightness, and rings.', '2']
    ],
    ordering: [
        ['day-night-g2', 'Grade 2 Day and Night', 'O-001', 'en', '2', 'day-cycle', '', '', 'Order the parts of the day from earliest to latest.', 'Sunrise > Noon > Sunset', 'The Sun rises, reaches its highest point, then sets.', '1'],
        ['day-night-g2', 'Grade 2 Day and Night', 'O-002', 'en', '2', 'day-cycle', '', '', 'Order these events from first to last.', 'Wake up > Eat breakfast > Go to school > Sleep', 'A school day starts at home and ends at night.', '1']
    ],
    numeric_response: [
        ['multiplication-g4', 'Grade 4 Multiplication', 'N-001', 'en', '4', 'times-tables', '', '', 'What is 12 × 12?', '144', '12 groups of 12 make 144.', '1'],
        ['multiplication-g4', 'Grade 4 Multiplication', 'N-002', 'en', '4', 'times-tables', '', '', 'Estimate pi to two decimal places.', 'tolerance::3.14~0.01', 'Pi is about 3.14159, so 3.14 is within 0.01.', '2']
    ],
    mixed: [
        ['prefix-mixed-g5', 'Grade 5 Mixed Practice', 'MX-001', 'en', '5', 'prefix-un', '', '', 'Which word means "not happy"?', 'multiple_choice', 'unhappy', 'happy', '', '', '', '', '1', '', '', '', '', '', '', 'un- changes the meaning to "not".', '1'],
        ['prefix-mixed-g5', 'Grade 5 Mixed Practice', 'MX-002', 'en', '5', 'prefix-un', '', '', 'Add the prefix un- to "kind": ___', 'fill_in_blank', '', '', '', '', '', '', '', '', 'unkind', 'un kind', '', '', '', 'un- + kind = unkind.', '1'],
        ['prefix-mixed-g5', 'Grade 5 Mixed Practice', 'MX-003', 'en', '5', 'prefix-un', '', '', 'The prefix un- means "not".', 'true_false', '', '', '', '', '', '', '', 'true', '', '', '', '', '', 'un- changes the meaning to "not".', '1']
    ]
};

const templateKeyFor = (type) => (String(type || '').trim().toLowerCase() === 'mixed' ? 'mixed' : resolvePracticeQuestionType(type));

const templateFor = (map, type) => map[templateKeyFor(type)];

export const PACK_CSV_TEMPLATES = Object.freeze(Object.fromEntries(
    Object.keys(BULK_ANSWER_HEADERS).map((type) => [type, {
        headers: [...CORE_HEADERS, ...(type === 'mixed' ? ['type'] : []), ...BULK_ANSWER_HEADERS[type], ...COMMON_TAIL],
        required: [...CORE_HEADERS.filter((header) => header !== 'standard_codes' && header !== 'skill_name'), ...SINGLE_REQUIRED[type].filter((header) => header !== 'prompt')],
        example: BULK_EXAMPLES[type]
    }])
));

export const SIMPLE_CSV_TEMPLATES = Object.freeze(Object.fromEntries(
    Object.keys(SINGLE_HEADERS).map((type) => [type, {
        headers: SINGLE_HEADERS[type],
        required: SINGLE_REQUIRED[type],
        example: SINGLE_EXAMPLES[type]
    }])
));

export const templatesForTarget = (target) => (target === 'bulk' ? PACK_CSV_TEMPLATES : SIMPLE_CSV_TEMPLATES);

export const buildPackTemplateCsv = (type, target = 'bulk') => {
    const template = templateFor(templatesForTarget(target), type);
    return template ? `\uFEFF${toCsv(template.headers, template.example)}\r\n` : null;
};

const splitList = (value) => String(value || '')
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean);

const readRows = (content, type, target) => {
    const template = templateFor(templatesForTarget(target), type);
    if (!template) throw new Error('Unknown pack template');
    if (Buffer.byteLength(String(content || ''), 'utf8') > PACK_LIMITS.maxBytes) {
        throw new Error('The file is larger than 5 MB');
    }
    const records = parseCsvRecords(content);
    if (records.length === 0) throw new Error('The CSV file is empty');
    const headers = records[0].cells.map((header) => header.trim().toLowerCase());
    const missing = template.required.filter((header) => !headers.includes(header));
    if (missing.length > 0) throw new Error(`Missing required column(s): ${missing.join(', ')}`);
    if (records.length - 1 > PACK_LIMITS.maxItems) {
        throw new Error(`The file has more than ${PACK_LIMITS.maxItems} questions`);
    }
    return records.slice(1).map((record) => {
        const data = {};
        headers.forEach((header, index) => { data[header] = String(record.cells[index] ?? '').trim(); });
        return { rowNumber: record.line, data };
    });
};

const FIELD_COLUMNS = {
    externalId: 'external_id',
    type: 'type',
    prompt: 'prompt',
    skillId: 'skill_key',
    options: 'option_1',
    correctOptionId: 'correct_option',
    correctAnswer: 'correct_answer',
    acceptedAnswers: 'answer',
    matchingPairs: 'matching_pairs',
    orderingItems: 'ordering_items',
    numericRule: 'numeric_rule',
    explanation: 'explanation',
    difficulty: 'difficulty'
};

// existingSkillKeys: keys the school already has (bulk only). standardLookup:
// optional Map { code: [standardId, ...] } so unknown/ambiguous codes error.
export const validatePackCsv = (content, type, {
    target = 'bulk',
    existingSkillKeys = new Set(),
    standardLookup = null
} = {}) => {
    const mixed = String(type || '').trim().toLowerCase() === 'mixed';
    const resolvedType = mixed ? 'mixed' : resolvePracticeQuestionType(type);
    const single = target === 'single';
    const rows = readRows(content, resolvedType, target);
    const errors = [];
    const packs = new Map();
    const add = (row, column, message) => errors.push({ row: row.rowNumber, column, message });
    const singlePackKey = '__single__';

    for (const row of rows) {
        const { data } = row;
        const before = errors.length;
        const packKey = single ? singlePackKey : String(data.pack_key || '').trim();
        const packTitle = String(data.pack_title || '').trim();
        const externalId = String(data.external_id || '').trim() || `q-${row.rowNumber}`;
        const language = String(data.language || '').trim().toLowerCase();
        const gradeLevels = splitList(data.grade_levels);
        const skillKey = String(data.skill_key || '').trim().toLowerCase();

        if (!single) {
            if (!packKey) add(row, 'pack_key', 'pack_key is required');
            if (!packTitle) add(row, 'pack_title', 'pack_title is required');
            if (!LANGUAGES.includes(language)) add(row, 'language', 'language must be en, ar or mixed');
            if (gradeLevels.length === 0) add(row, 'grade_levels', 'grade_levels is required (semicolon-separated)');
            if (!skillKey) add(row, 'skill_key', 'skill_key is required');
            else if (!existingSkillKeys.has(skillKey) && !String(data.skill_name || '').trim()) {
                add(row, 'skill_key', `Unknown skill ${skillKey}; add skill_name to create it as a draft`);
            }
            if (packKey && packs.has(packKey)) {
                const pack = packs.get(packKey);
                if (pack.title !== packTitle) add(row, 'pack_title', `pack_title for ${packKey} must match row ${pack.firstRow}`);
                if (pack.language !== language) add(row, 'language', `language for ${packKey} must match row ${pack.firstRow}`);
                if (pack.gradeLevels.join(';') !== gradeLevels.join(';')) {
                    add(row, 'grade_levels', `grade_levels for ${packKey} must match row ${pack.firstRow}`);
                }
            }
        }

        const prompt = String(data.prompt || '');
        const rowType = mixed ? resolvePracticeQuestionType(data.type) : resolvedType;
        // Sparse option columns keep their original numbers, but the ids are
        // renumbered to the filled options so correct_option always points at
        // a real choice.
        const filledOptions = [];
        for (let index = 1; index <= ITEM_LIMITS.maxOptions; index += 1) {
            const text = String(data[`option_${index}`] || '').trim();
            if (text) filledOptions.push({ index, text });
        }
        const options = filledOptions.map((option, position) => ({ id: String(position + 1), text: option.text }));
        let correctOptionId = '';
        let correctAnswer = '';
        let acceptedAnswers = [];
        if (rowType === 'multiple_choice') {
            const correct = Number(data.correct_option);
            const match = filledOptions.find((option) => option.index === correct);
            if (!data.correct_option || !Number.isInteger(correct) || !match) {
                add(row, 'correct_option', filledOptions.length === 0
                    ? 'correct_option is required'
                    : `correct_option must name a filled option column (${filledOptions.map((option) => option.index).join(', ')})`);
            } else {
                correctOptionId = String(filledOptions.indexOf(match) + 1);
            }
        } else if (rowType === 'multiple_select') {
            const rawKeys = String(data.correct_answer || '').split('|').map((key) => key.trim()).filter(Boolean);
            const mapped = [];
            let badKey = false;
            for (const key of rawKeys) {
                const columnNumber = Number(key);
                const match = filledOptions.find((option) => option.index === columnNumber);
                if (!Number.isInteger(columnNumber) || !match) {
                    badKey = true;
                    break;
                }
                mapped.push(String(filledOptions.indexOf(match) + 1));
            }
            if (badKey || mapped.length === 0) {
                add(row, 'correct_answer', filledOptions.length === 0
                    ? 'correct_answer is required'
                    : `correct_answer must name filled option columns separated by | (${filledOptions.map((option) => option.index).join(', ')})`);
            } else {
                correctAnswer = mapped.join('|');
            }
        } else if (rowType === 'true_false') {
            correctAnswer = String(data.correct_answer || '').trim();
        } else if (rowType === 'fill_in_blank') {
            const answer = String(data.answer || '').trim();
            acceptedAnswers = [answer, ...splitList(data.accepted_answers)];
        }

        // Placeholder skill id: single-mode rows are tagged with the selected
        // skill by the plan builder after validation.
        const itemResult = validateGameItem({
            externalId,
            type: rowType,
            prompt,
            options,
            correctOptionId,
            correctAnswer,
            acceptedAnswers,
            matchingPairs: data.matching_pairs,
            orderingItems: data.ordering_items,
            numericRule: data.numeric_rule,
            explanation: String(data.explanation || '').trim(),
            skillId: '0'.repeat(24),
            difficulty: data.difficulty === undefined || data.difficulty === '' ? 2 : Number(data.difficulty)
        });
        for (const error of itemResult.errors) {
            if (error.field === 'skillId') continue;
            add(row, FIELD_COLUMNS[error.field] || error.field, error.message);
        }

        const standardCodes = splitList(data.standard_codes).map((code) => code.toUpperCase());
        const standardIds = [];
        if (standardLookup) {
            for (const code of standardCodes) {
                const matches = standardLookup.get(code) || [];
                if (matches.length === 0) add(row, 'standard_codes', `Unknown standard code ${code}`);
                else if (matches.length > 1) add(row, 'standard_codes', `Ambiguous standard code ${code}; use a code unique to one grade`);
                else standardIds.push(String(matches[0]));
            }
        }

        if (errors.length !== before) continue;

        if (!packs.has(packKey)) {
            packs.set(packKey, {
                packKey,
                title: single ? '' : packTitle,
                description: '',
                language: single ? '' : language,
                gradeLevels: single ? [] : gradeLevels,
                firstRow: row.rowNumber,
                items: [],
                externalIds: new Set()
            });
        }
        const pack = packs.get(packKey);
        if (pack.externalIds.has(externalId)) {
            add(row, 'external_id', `Duplicate external_id ${externalId}${single ? '' : ` in ${packKey}`}`);
            continue;
        }
        pack.externalIds.add(externalId);
        pack.items.push({
            ...itemResult.item,
            rowNumber: row.rowNumber,
            skillKey,
            skillName: String(data.skill_name || '').trim(),
            standardCodes,
            standardIds
        });
    }

    const packList = Array.from(packs.values()).map((pack) => ({
        ...pack,
        externalIds: undefined,
        items: pack.items
    }));
    const totalRows = rows.length;
    const validRows = packList.reduce((total, pack) => total + pack.items.length, 0);
    return {
        type: resolvedType,
        target,
        packs: packList,
        errors: errors.sort((a, b) => a.row - b.row),
        totalRows,
        validRows,
        invalidRows: totalRows - validRows
    };
};