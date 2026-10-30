/**
 * Tutor lesson CSV. The subject and the grade are picked in the panel, never read
 * from the sheet, so a typo in a spreadsheet cannot push a lesson to the wrong
 * class. One bad row rejects the whole file and the message names the row.
 */
const MAX_CSV_BYTES = 1500 * 1024;
const MAX_LESSONS = 400;
const MAX_CONTENT = 20000;

export const TUTOR_CSV_COLUMNS = [
    'unit_number',
    'unit_title',
    'chapter_number',
    'chapter_title',
    'lesson_number',
    'lesson_title',
    'content',
    'standards',
    'keywords'
];

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
                throw new Error('The CSV has unexpected text after a quoted value. Put quotes around any cell that contains a comma.');
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

const wholeNumber = (value) => {
    const trimmed = String(value ?? '').trim();
    if (!trimmed) return null;
    const number = Number(trimmed);
    return Number.isInteger(number) ? number : NaN;
};

const list = (value) => String(value ?? '')
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);

export const parseTutorCsv = (csvText) => {
    const source = String(csvText || '');
    if (new TextEncoder().encode(source).length > MAX_CSV_BYTES) {
        throw new Error('The CSV must be no larger than 1.5 MB.');
    }
    const rows = parseRows(source);
    if (rows.length < 2) throw new Error('The CSV needs a header row and at least one lesson row.');

    const headers = rows[0].map(normalizeHeader);
    if (new Set(headers).size !== headers.length) throw new Error('The CSV contains duplicate column names.');
    const required = ['lesson_number', 'lesson_title', 'content'];
    const missing = required.filter((header) => !headers.includes(header));
    if (missing.length) throw new Error(`Missing required column(s): ${missing.join(', ')}.`);

    const unknown = headers.filter((header) => header && !TUTOR_CSV_COLUMNS.includes(header));
    if (unknown.length) {
        throw new Error(`These columns are not part of the tutor template: ${unknown.join(', ')}. Download the template to see the exact columns.`);
    }

    const records = rows.slice(1).map((cells, rowIndex) => {
        if (cells.length > headers.length && cells.slice(headers.length).some((cell) => cell.trim())) {
            throw new Error(`Row ${rowIndex + 2} has more values than the header row.`);
        }
        return Object.fromEntries(headers.map((header, index) => [header, cells[index] || '']));
    });

    const seen = new Set();
    const unitTitleBy = new Map();
    const chapterTitleBy = new Map();
    const lessons = records.map((record, index) => {
        const rowNumber = index + 2;
        const lessonNumber = wholeNumber(record.lesson_number);
        if (!Number.isInteger(lessonNumber) || lessonNumber < 1) {
            throw new Error(`Row ${rowNumber}: lesson_number must be a whole number from 1.`);
        }
        const title = String(record.lesson_title || '').trim();
        if (!title) throw new Error(`Row ${rowNumber}: lesson_title is required.`);
        if (title.length > 200) throw new Error(`Row ${rowNumber}: lesson_title must be 200 characters or fewer.`);
        const content = String(record.content || '').replace(/^(?:\r\n|\r|\n)+|(?:\r\n|\r|\n)+$/g, '');
        if (!content.trim()) throw new Error(`Row ${rowNumber}: content is required.`);
        if (content.length > MAX_CONTENT) {
            throw new Error(`Row ${rowNumber}: content must be 20,000 characters or fewer. Split a very long lesson into two lessons.`);
        }

        const unitNumber = wholeNumber(record.unit_number);
        const chapterNumber = wholeNumber(record.chapter_number);
        if (unitNumber !== null && (!Number.isInteger(unitNumber) || unitNumber < 1)) {
            throw new Error(`Row ${rowNumber}: unit_number must be a whole number from 1, or leave it empty.`);
        }
        if (chapterNumber !== null && (!Number.isInteger(chapterNumber) || chapterNumber < 1)) {
            throw new Error(`Row ${rowNumber}: chapter_number must be a whole number from 1, or leave it empty.`);
        }
        const unitTitle = String(record.unit_title || '').trim();
        const chapterTitle = String(record.chapter_title || '').trim();
        if (unitNumber !== null && !unitTitle) throw new Error(`Row ${rowNumber}: add unit_title, because unit_number is filled.`);
        if (unitNumber === null && (unitTitle || chapterNumber !== null || chapterTitle)) {
            throw new Error(`Row ${rowNumber}: add unit_number before unit_title, chapter_number or chapter_title.`);
        }
        if (chapterNumber !== null && !chapterTitle) throw new Error(`Row ${rowNumber}: add chapter_title, because chapter_number is filled.`);
        if (chapterNumber === null && chapterTitle) throw new Error(`Row ${rowNumber}: add chapter_number before chapter_title.`);

        const standards = [...new Set(list(record.standards).map((code) => code.toUpperCase()))];
        if (standards.length > 20) throw new Error(`Row ${rowNumber}: a lesson can name no more than 20 standards.`);
        if (standards.some((code) => code.length > 40)) {
            throw new Error(`Row ${rowNumber}: each standard code must be 40 characters or fewer.`);
        }

        if (unitNumber !== null) {
            if (unitTitleBy.has(unitNumber) && unitTitleBy.get(unitNumber) !== unitTitle) {
                throw new Error(
                    `Row ${rowNumber}: unit ${unitNumber} is called "${unitTitleBy.get(unitNumber)}" earlier in the file. Use the same title for every lesson in one unit.`
                );
            }
            unitTitleBy.set(unitNumber, unitTitle);
        }
        if (chapterNumber !== null) {
            const key = `${unitNumber}:${chapterNumber}`;
            if (chapterTitleBy.has(key) && chapterTitleBy.get(key) !== chapterTitle) {
                throw new Error(
                    `Row ${rowNumber}: chapter ${chapterNumber} is called "${chapterTitleBy.get(key)}" earlier in the file. Use the same title for every lesson in one chapter.`
                );
            }
            chapterTitleBy.set(key, chapterTitle);
        }

        const slot = [unitNumber ?? '-', chapterNumber ?? '-', lessonNumber].join(':');
        if (seen.has(slot)) {
            throw new Error(
                `Row ${rowNumber}: lesson ${lessonNumber} is already used in `
                + `${unitTitle || 'this file'}${chapterTitle ? ` / ${chapterTitle}` : ''}. Two lessons cannot share the same place.`
            );
        }
        seen.add(slot);

        return {
            unitNumber,
            unitTitle,
            chapterNumber,
            chapterTitle,
            lessonNumber,
            title,
            content,
            standards,
            keywords: [...new Set(list(record.keywords).map((word) => word.toLowerCase()))].slice(0, 20)
        };
    });

    if (lessons.length > MAX_LESSONS) throw new Error(`A file can hold no more than ${MAX_LESSONS} lessons. Import a unit at a time.`);

    lessons.sort((left, right) => (
        (left.unitNumber ?? 0) - (right.unitNumber ?? 0)
        || (left.chapterNumber ?? 0) - (right.chapterNumber ?? 0)
        || left.lessonNumber - right.lessonNumber
    ));

    const units = new Set(lessons.map((lesson) => lesson.unitNumber ?? '-')).size;
    return { lessons, units };
};

const csvCell = (value) => {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const buildTutorCsvTemplate = () => {
    const rows = [
        TUTOR_CSV_COLUMNS,
        [
            '1', 'Matter and its states',
            '1', 'Solids and liquids',
            '1', 'Solids keep their shape',
            'A solid keeps its shape because its particles are packed tightly together. A liquid flows because its particles can slide past each other. Pour a liquid into a new container and it takes the shape of that container.',
            'SCI.5.1|SCI.5.2',
            'solid|liquid|particles'
        ],
        [
            '1', 'Matter and its states',
            '1', 'Solids and liquids',
            '2', 'Gases fill the space',
            'A gas spreads out to fill every part of its container. The air in a balloon pushes on the inside of the balloon, which is why the balloon keeps its round shape.',
            'SCI.5.1',
            'gas|expand|container'
        ],
        [
            '1', 'Matter and its states',
            '2', 'Changing state',
            '3', 'Melting and freezing',
            'Heating a solid gives its particles more energy, so it can melt into a liquid. Cooling a liquid takes that energy away and it freezes back into a solid. Ice melts at zero degrees Celsius.',
            'SCI.5.3',
            'melt|freeze|temperature'
        ]
    ];
    return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
};
