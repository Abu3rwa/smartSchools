export const IMPORT_TYPES = ['combined', 'lists', 'words', 'word_sources', 'mcq', 'matching'];
export const PART_OF_SPEECH = ['n', 'v', 'adj', 'adv'];
export const WORD_FORMS = ['plural', 'verb_s', 'past', 'ing', 'comparative', 'superlative', 'contraction'];
export const SOURCES = ['oxford', 'longman', 'webster'];

const SOURCE_COLUMN_SUFFIXES = ['definition', 'url', 'audio_us', 'audio_uk', 'example_audio'];
const SOURCE_COLUMNS = ['oxford', 'longman', 'webster'].flatMap((source) => SOURCE_COLUMN_SUFFIXES.map((suffix) => `${source}_${suffix}`));
const COMBINED_CORE = ['list_id', 'list_title', 'lesson_title', 'word', 'part_of_speech', 'form', 'base_word', 'example_sentence', 'student_friendly_meaning', 'arabic_meaning', 'notes'];

export const MATCH_MAX_PAIRS = 6;
const MATCH_PAIR_COLUMNS = Array.from({ length: MATCH_MAX_PAIRS }, (_, index) => [`left_${index + 1}`, `right_${index + 1}`]).flat();

export const TEMPLATES = Object.freeze({
    mcq: {
        headers: ['question_id', 'scope', 'word', 'question', 'option_a', 'option_b', 'option_c', 'option_d', 'correct', 'explanation'],
        required: ['question_id', 'scope', 'question', 'option_a', 'option_b', 'correct'],
        example: [
            ['Q-S1L1-001', 'S1-L1', 'debris', 'Which sentence uses debris correctly?', 'Debris covered the road after the storm.', 'She ate a bowl of debris.', 'The debris sang loudly.', 'He debris the door.', 'A', 'Debris means broken pieces left after something is destroyed.'],
            ['Q-S1L2-001', 'S1-L2', 'wages', 'Which word is the plural form?', 'wage', 'wages', '', '', 'B', 'Wages ends in -s because it means more than one payment.'],
            ['Q-MULTI-001', 'S1-L1;S1-L2', '', 'Which word means money paid for work?', 'debris', 'wages', 'emphasis', '', 'B', ''],
            ['Q-ALL-001', 'ALL', '', 'Which word is a noun?', 'quickly', 'debris', 'happily', 'run', 'B', 'A noun names a thing.']
        ]
    },
    matching: {
        headers: ['set_id', 'scope', 'instruction', ...MATCH_PAIR_COLUMNS],
        required: ['set_id', 'scope', 'left_1', 'right_1', 'left_2', 'right_2'],
        example: [
            ['M-S1L1-001', 'S1-L1', 'Match each word to its meaning.', 'debris', 'broken pieces left after something is destroyed', 'wages', 'money paid for work', 'emphasis', 'special importance given to something', '', '', '', '', '', ''],
            ['M-S1L2-001', 'S1-L2', 'Match each word to its part of speech.', 'quickly', 'adverb', 'debris', 'noun', '', '', '', '', '', '', '', ''],
            ['M-ALL-001', 'ALL', '', 'happy', 'sad', 'big', 'small', 'hot', 'cold', 'fast', 'slow', '', '', '', '']
        ]
    },
    combined: {
        headers: [...COMBINED_CORE, ...SOURCE_COLUMNS],
        required: ['list_id', 'word', 'part_of_speech'],
        example: [
            ['S1-L1', 'Semester 1 - List 1', '', 'debris', 'n.', '', '', 'Debris covered the road after the storm.', 'broken pieces left after something is destroyed', '', '',
                'scattered pieces of rubbish or remains', 'https://example.com/debris', 'https://example.com/debris-us.mp3', 'https://example.com/debris-uk.mp3', '',
                '', '', '', '', '', '', '', '', '', '']
        ]
    },
    lists: {
        headers: ['list_id', 'semester', 'list_number', 'title', 'lesson_title', 'order', 'visible'],
        example: [
            ['S1-L1', '1', '1', 'Semester 1 - List 1', '', '1', 'true'],
            ['S1-L2', '1', '2', 'Semester 1 - List 2', '', '2', 'true']
        ]
    },
    words: {
        headers: ['list_id', 'word', 'part_of_speech', 'form', 'base_word', 'example_sentence', 'student_friendly_meaning', 'arabic_meaning', 'notes'],
        example: [
            ['S1-L1', 'debris', 'n.', '', '', 'Debris covered the road after the storm.', 'broken pieces left after something is destroyed', '', ''],
            ['S1-L2', 'wages', 'n.', 'plural', 'wage', 'Workers receive their wages on Friday.', 'money paid for work', '', '']
        ]
    },
    word_sources: {
        headers: ['list_id', 'word', 'part_of_speech', 'source', 'definition_text', 'page_url', 'audio_us_url', 'audio_uk_url', 'example_audio_url'],
        example: [['S1-L1', 'debris', 'n.', 'oxford', 'scattered pieces of rubbish or remains', 'https://example.com/debris', 'https://example.com/debris-us.mp3', 'https://example.com/debris-uk.mp3', '']]
    }
});

const csvEscape = (value) => {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const toCsv = (headers, rows) => [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\r\n');

export const buildTemplateCsv = (type) => {
    const template = TEMPLATES[type];
    return template ? `\uFEFF${toCsv(template.headers, template.example)}\r\n` : null;
};

// RFC-4180 style parser: quoted fields may contain commas, quotes and line breaks.
export const parseCsvRecords = (content) => {
    const text = String(content || '').replace(/^\uFEFF/, '');
    const records = [];
    let record = [];
    let value = '';
    let quoted = false;
    let line = 1;
    let recordLine = 1;

    const endRecord = () => {
        record.push(value);
        value = '';
        if (record.some((cell) => cell.trim() !== '')) records.push({ line: recordLine, cells: record });
        record = [];
    };

    for (let index = 0; index < text.length; index += 1) {
        const character = text[index];
        if (quoted) {
            if (character === '"' && text[index + 1] === '"') {
                value += '"';
                index += 1;
            } else if (character === '"') {
                quoted = false;
            } else {
                if (character === '\n') line += 1;
                value += character;
            }
        } else if (character === '"') {
            quoted = true;
        } else if (character === ',') {
            record.push(value);
            value = '';
        } else if (character === '\n' || character === '\r') {
            if (character === '\r' && text[index + 1] === '\n') index += 1;
            endRecord();
            line += 1;
            recordLine = line;
        } else {
            value += character;
        }
    }
    if (quoted) throw new Error('A quoted value was never closed');
    if (value !== '' || record.length > 0) endRecord();
    return records;
};

export const parseCsvTable = (content, type) => {
    const records = parseCsvRecords(content);
    if (records.length === 0) throw new Error('The CSV file is empty');
    const headers = records[0].cells.map((header) => header.trim().toLowerCase());
    const required = TEMPLATES[type].required || TEMPLATES[type].headers;
    const missing = required.filter((header) => !headers.includes(header));
    if (missing.length > 0) throw new Error(`Missing required column(s): ${missing.join(', ')}`);
    const rows = records.slice(1).map((record) => {
        const data = {};
        headers.forEach((header, columnIndex) => { data[header] = String(record.cells[columnIndex] ?? '').trim(); });
        return { rowNumber: record.line, data };
    });
    return { headers, rows };
};

export const normalizeWord = (word) => String(word || '').trim().toLowerCase().replace(/\s+/g, ' ');

// "v./n." / "n, v" / "adj." -> ['n','v'] (order kept); null when any token is unknown.
export const parsePartOfSpeech = (value) => {
    const tokens = String(value || '').toLowerCase().split(/[\/,;|&\s]+/).map((token) => token.replace(/\./g, '').trim()).filter(Boolean);
    if (tokens.length === 0 || tokens.some((token) => !PART_OF_SPEECH.includes(token))) return null;
    return [...new Set(tokens)];
};

export const posKeyOf = (partOfSpeech) => [...partOfSpeech].sort().join('/');

export const formatPartOfSpeech = (partOfSpeech) => (partOfSpeech || []).map((entry) => `${entry}.`).join('/');

const parseBoolean = (value, fallback) => {
    const text = String(value ?? '').trim().toLowerCase();
    if (text === '') return fallback;
    if (['true', 'yes', 'y', '1'].includes(text)) return true;
    if (['false', 'no', 'n', '0'].includes(text)) return false;
    return null;
};

export const isHttpUrl = (value) => {
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
};

const LIST_ID_PATTERN = /^S([12])-L(\d{1,2})$/;
export const normalizeListId = (value) => String(value || '').trim().toUpperCase();

const makeCollector = () => {
    const errors = [];
    return {
        errors,
        add: (row, column, message) => errors.push({ row: row.rowNumber, column, message })
    };
};

export const validateListRows = (rows) => {
    const { errors, add } = makeCollector();
    const valid = [];
    const seen = new Set();
    for (const row of rows) {
        const { data } = row;
        const before = errors.length;
        const listId = normalizeListId(data.list_id);
        const match = LIST_ID_PATTERN.exec(listId);
        if (!match) add(row, 'list_id', 'list_id must look like S1-L1 or S2-L6');
        else if (seen.has(listId)) add(row, 'list_id', `Duplicate list_id ${listId}`);
        const semester = Number(data.semester);
        if (![1, 2].includes(semester)) add(row, 'semester', 'semester must be 1 or 2');
        else if (match && Number(match[1]) !== semester) add(row, 'semester', 'semester does not match list_id');
        const listNumber = Number(data.list_number);
        if (!Number.isInteger(listNumber) || listNumber < 1) add(row, 'list_number', 'list_number must be a positive whole number');
        else if (match && Number(match[2]) !== listNumber) add(row, 'list_number', 'list_number does not match list_id');
        if (!data.title) add(row, 'title', 'title is required');
        const order = data.order === '' ? listNumber : Number(data.order);
        if (!Number.isFinite(order) || order < 0) add(row, 'order', 'order must be a number');
        const visible = parseBoolean(data.visible, true);
        if (visible === null) add(row, 'visible', 'visible must be true or false');
        if (match) seen.add(listId);
        if (errors.length === before) {
            valid.push({ rowNumber: row.rowNumber, listId, semester, listNumber, title: data.title, lessonTitle: data.lesson_title || '', order, visible });
        }
    }
    return { valid, errors };
};

export const validateWordRows = (rows, knownListIds) => {
    const { errors, add } = makeCollector();
    const valid = [];
    const seen = new Set();
    for (const row of rows) {
        const { data } = row;
        const before = errors.length;
        const listId = normalizeListId(data.list_id);
        if (!listId) add(row, 'list_id', 'list_id is required');
        else if (!knownListIds.has(listId)) add(row, 'list_id', `Unknown list ${listId}; import the list first`);
        if (!data.word) add(row, 'word', 'word is required');
        const partOfSpeech = parsePartOfSpeech(data.part_of_speech);
        if (!partOfSpeech) add(row, 'part_of_speech', 'part_of_speech must use n., v., adj. or adv. (e.g. v./n.)');
        const form = data.form.toLowerCase();
        if (form && !WORD_FORMS.includes(form)) add(row, 'form', `form must be one of ${WORD_FORMS.join(', ')} or empty`);
        if (form && !data.base_word) add(row, 'base_word', 'base_word is required when form is set');
        if (partOfSpeech && data.word) {
            const key = `${listId}|${normalizeWord(data.word)}|${posKeyOf(partOfSpeech)}`;
            if (seen.has(key)) add(row, 'word', 'Duplicate row for the same list, word and part of speech');
            seen.add(key);
        }
        if (errors.length === before) {
            valid.push({
                rowNumber: row.rowNumber,
                listId,
                word: data.word,
                normalizedWord: normalizeWord(data.word),
                partOfSpeech,
                posKey: posKeyOf(partOfSpeech),
                form,
                baseWord: data.base_word,
                exampleSentence: data.example_sentence,
                meaning: data.student_friendly_meaning,
                arabicMeaning: data.arabic_meaning,
                notes: data.notes
            });
        }
    }
    return { valid, errors };
};

export const validateSourceRows = (rows, knownListIds) => {
    const { errors, add } = makeCollector();
    const valid = [];
    const seen = new Set();
    const urlColumns = ['page_url', 'audio_us_url', 'audio_uk_url', 'example_audio_url'];
    for (const row of rows) {
        const { data } = row;
        const before = errors.length;
        const listId = normalizeListId(data.list_id);
        if (!listId) add(row, 'list_id', 'list_id is required');
        else if (!knownListIds.has(listId)) add(row, 'list_id', `Unknown list ${listId}`);
        if (!data.word) add(row, 'word', 'word is required');
        const partOfSpeech = parsePartOfSpeech(data.part_of_speech);
        if (!partOfSpeech) add(row, 'part_of_speech', 'part_of_speech must use n., v., adj. or adv.');
        const source = data.source.toLowerCase();
        if (!SOURCES.includes(source)) add(row, 'source', `source must be one of ${SOURCES.join(', ')}`);
        for (const column of urlColumns) {
            if (data[column] && !isHttpUrl(data[column])) add(row, column, `${column} must be an http(s) URL`);
        }
        if (!data.definition_text && !urlColumns.some((column) => data[column])) {
            add(row, 'definition_text', 'Provide a definition or at least one URL');
        }
        if (partOfSpeech && data.word && SOURCES.includes(source)) {
            const key = `${listId}|${normalizeWord(data.word)}|${posKeyOf(partOfSpeech)}|${source}`;
            if (seen.has(key)) add(row, 'source', 'Only one sense per source per word is allowed');
            seen.add(key);
        }
        if (errors.length === before) {
            valid.push({
                rowNumber: row.rowNumber,
                listId,
                normalizedWord: normalizeWord(data.word),
                posKey: posKeyOf(partOfSpeech),
                source,
                definitionText: data.definition_text,
                pageUrl: data.page_url,
                audioUsUrl: data.audio_us_url,
                audioUkUrl: data.audio_uk_url,
                exampleAudioUrl: data.example_audio_url
            });
        }
    }
    return { valid, errors };
};

export const errorsToCsv = (errors) => `\uFEFF${toCsv(['row', 'column', 'message'], errors.map((error) => [error.row, error.column, error.message]))}\r\n`;

// One combined row -> list row + word row + up to three source rows (all keep the original row number).
export const expandCombinedRows = (rows) => {
    const listRows = [];
    const wordRows = [];
    const sourceRows = [];
    const listIndex = new Map();
    for (const row of rows) {
        const { data, rowNumber } = row;
        const listId = normalizeListId(data.list_id);
        const match = LIST_ID_PATTERN.exec(listId);
        const existing = listIndex.get(listId);
        if (!existing) {
            const semester = match ? match[1] : '';
            const listNumber = match ? String(Number(match[2])) : '';
            const entry = { rowNumber, data: { list_id: data.list_id, semester, list_number: listNumber, title: data.list_title || (match ? `Semester ${semester} - List ${listNumber}` : ''), lesson_title: data.lesson_title || '', order: '', visible: '' } };
            entry.defaulted = !data.list_title;
            listIndex.set(listId, entry);
            listRows.push(entry);
        } else {
            if (data.list_title && existing.defaulted) { existing.data.title = data.list_title; existing.defaulted = false; }
            if (!existing.data.lesson_title && data.lesson_title) existing.data.lesson_title = data.lesson_title;
        }
        wordRows.push({ rowNumber, data });
        for (const source of SOURCES) {
            const get = (suffix) => data[`${source}_${suffix}`] || '';
            if (!SOURCE_COLUMN_SUFFIXES.some((suffix) => get(suffix))) continue;
            sourceRows.push({ rowNumber, data: {
                list_id: data.list_id, word: data.word, part_of_speech: data.part_of_speech, source,
                definition_text: get('definition'), page_url: get('url'), audio_us_url: get('audio_us'),
                audio_uk_url: get('audio_uk'), example_audio_url: get('example_audio')
            } });
        }
    }
    return { listRows, wordRows, sourceRows };
};

const MCQ_KEYS = ['A', 'B', 'C', 'D'];

export const parseMcqScope = (value) => {
    const text = String(value || '').trim();
    if (!text) return { error: 'scope is required (a list id, ids separated by ;, or ALL)' };
    if (text.toUpperCase() === 'ALL') return { scopeAll: true, listIds: [] };
    const listIds = [...new Set(text.split(';').map(normalizeListId).filter(Boolean))];
    if (listIds.length === 0) return { error: 'scope is required (a list id, ids separated by ;, or ALL)' };
    if (listIds.includes('ALL')) return { error: 'ALL cannot be combined with list ids' };
    return { scopeAll: false, listIds };
};

export const validateMcqRows = (rows, knownListIds) => {
    const { errors, add } = makeCollector();
    const valid = [];
    const seen = new Set();
    for (const row of rows) {
        const { data } = row;
        const before = errors.length;
        const questionId = String(data.question_id || '').trim();
        if (!questionId) add(row, 'question_id', 'question_id is required');
        else if (questionId.length > 64) add(row, 'question_id', 'question_id must be 64 characters or fewer');
        else if (seen.has(questionId)) add(row, 'question_id', `Duplicate question_id ${questionId}`);
        else seen.add(questionId);
        const scope = parseMcqScope(data.scope);
        if (scope.error) add(row, 'scope', scope.error);
        else for (const id of scope.listIds) if (!knownListIds.has(id)) add(row, 'scope', `Unknown list ${id}`);
        if (!data.question) add(row, 'question', 'question is required');
        const texts = MCQ_KEYS.map((key) => String(data[`option_${key.toLowerCase()}`] || '').trim());
        const seenText = new Set();
        texts.forEach((text, index) => {
            if (!text) return;
            const normalized = text.toLowerCase();
            if (seenText.has(normalized)) add(row, `option_${MCQ_KEYS[index].toLowerCase()}`, 'Duplicate option in the same question');
            seenText.add(normalized);
        });
        if (texts.filter(Boolean).length < 2) add(row, 'option_a', 'At least two options are required');
        const correct = String(data.correct || '').trim().toUpperCase();
        if (!MCQ_KEYS.includes(correct)) add(row, 'correct', 'correct must be A, B, C or D');
        else if (!texts[MCQ_KEYS.indexOf(correct)]) add(row, 'correct', `Option ${correct} is empty`);
        if (errors.length === before) {
            valid.push({
                rowNumber: row.rowNumber,
                questionId,
                scopeAll: scope.scopeAll,
                listIds: scope.listIds,
                wordText: String(data.word || '').trim(),
                question: data.question,
                options: MCQ_KEYS.map((key, index) => ({ key, text: texts[index] })).filter((option) => option.text),
                correct,
                explanation: data.explanation || ''
            });
        }
    }
    return { valid, errors };
};

export const validateMatchingRows = (rows, knownListIds) => {
    const { errors, add } = makeCollector();
    const valid = [];
    const seen = new Set();
    for (const row of rows) {
        const { data } = row;
        const before = errors.length;
        const setId = String(data.set_id || '').trim();
        if (!setId) add(row, 'set_id', 'set_id is required');
        else if (setId.length > 64) add(row, 'set_id', 'set_id must be 64 characters or fewer');
        else if (seen.has(setId)) add(row, 'set_id', `Duplicate set_id ${setId}`);
        else seen.add(setId);
        const scope = parseMcqScope(data.scope);
        if (scope.error) add(row, 'scope', scope.error);
        else for (const id of scope.listIds) if (!knownListIds.has(id)) add(row, 'scope', `Unknown list ${id}`);
        const pairs = [];
        const lefts = new Set();
        const rights = new Set();
        for (let number = 1; number <= MATCH_MAX_PAIRS; number += 1) {
            const left = String(data[`left_${number}`] || '').trim();
            const right = String(data[`right_${number}`] || '').trim();
            if (!left && !right) continue;
            if (!left || !right) { add(row, left ? `right_${number}` : `left_${number}`, `Pair ${number} needs both a left and a right item`); continue; }
            if (lefts.has(left.toLowerCase())) add(row, `left_${number}`, 'Duplicate left item in the same set');
            if (rights.has(right.toLowerCase())) add(row, `right_${number}`, 'Duplicate right item in the same set');
            lefts.add(left.toLowerCase());
            rights.add(right.toLowerCase());
            pairs.push({ left, right });
        }
        if (pairs.length < 2) add(row, 'left_2', 'At least two pairs are required');
        if (errors.length === before) {
            valid.push({ rowNumber: row.rowNumber, setId, scopeAll: scope.scopeAll, listIds: scope.listIds, instruction: data.instruction || '', pairs });
        }
    }
    return { valid, errors };
};
