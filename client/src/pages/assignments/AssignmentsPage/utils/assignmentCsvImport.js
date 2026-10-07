const MAX_LINKS = 20;

const parseCsv = (text) => {
    const rows = [];
    let row = [];
    let value = '';
    let quoted = false;

    for (let index = 0; index < text.length; index += 1) {
        const character = text[index];
        if (quoted) {
            if (character === '"' && text[index + 1] === '"') {
                value += '"';
                index += 1;
            } else if (character === '"') {
                quoted = false;
            } else {
                value += character;
            }
        } else if (character === '"' && value.length === 0) {
            quoted = true;
        } else if (character === ',') {
            row.push(value);
            value = '';
        } else if (character === '\n' || character === '\r') {
            if (character === '\r' && text[index + 1] === '\n') index += 1;
            row.push(value);
            if (row.some((cell) => cell.trim())) rows.push(row);
            row = [];
            value = '';
        } else {
            value += character;
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
    if (value == null || !value.trim()) return undefined;
    const normalized = value.trim().toLowerCase();
    if (['true', 'yes', '1'].includes(normalized)) return true;
    if (['false', 'no', '0'].includes(normalized)) return false;
    throw new Error(`${column} must be true or false.`);
};

const validateLinks = (links) => {
    if (!Array.isArray(links) || links.length > MAX_LINKS) {
        throw new Error(`Links must be a list of no more than ${MAX_LINKS} items.`);
    }
    return links.map((link, index) => {
        const type = String(link.type || 'external_url').trim();
        const title = String(link.title || '').trim();
        if (type === 'external_url') {
            let url;
            try {
                url = new URL(String(link.url || '').trim());
            } catch {
                throw new Error(`Link ${index + 1} must use a valid HTTP or HTTPS URL.`);
            }
            if (!['http:', 'https:'].includes(url.protocol)) {
                throw new Error(`Link ${index + 1} must use a valid HTTP or HTTPS URL.`);
            }
            return { type, title, url: url.href, refId: '' };
        }
        if (['assessment', 'practice_objective'].includes(type) && link.refId) {
            return { type, title, url: '', refId: String(link.refId).trim() };
        }
        throw new Error(`Link ${index + 1} needs an HTTP(S) URL or a reference ID for its type.`);
    });
};

export const parseAssignmentCsv = (csvText) => {
    const rows = parseCsv(String(csvText || ''));
    if (rows.length < 2) throw new Error('The CSV must include a header and one assignment row.');
    if (rows.length > 2) throw new Error('Import one assignment at a time. This CSV has multiple assignment rows.');

    const headers = rows[0].map(normalizeHeader);
    if (new Set(headers).size !== headers.length) throw new Error('The CSV contains duplicate column names.');
    const values = rows[1];
    if (values.length > headers.length && values.slice(headers.length).some((cell) => cell.trim())) {
        throw new Error('The assignment row has more values than the header row.');
    }
    const record = Object.fromEntries(headers.map((header, index) => [header, (values[index] || '').trim()]));
    if (!record.title) throw new Error('Assignment title is required.');

    const imported = { title: record.title };
    if (record.assignment_type) imported.assignmentType = record.assignment_type;
    if (record.instructions) imported.instructions = record.instructions;

    if (record.due_date) {
        const [year, month, day] = record.due_date.split('-').map(Number);
        const parsedDate = new Date(Date.UTC(year, month - 1, day));
        if (!/^\d{4}-\d{2}-\d{2}$/.test(record.due_date)
            || parsedDate.getUTCFullYear() !== year
            || parsedDate.getUTCMonth() !== month - 1
            || parsedDate.getUTCDate() !== day) {
            throw new Error('Due date must use YYYY-MM-DD format.');
        }
        imported.dueDate = record.due_date;
    }

    if (record.max_marks) {
        const maxMarks = Number(record.max_marks);
        if (!Number.isInteger(maxMarks) || maxMarks < 1 || maxMarks > 1000) {
            throw new Error('Maximum marks must be a whole number between 1 and 1000.');
        }
        imported.maxMarks = maxMarks;
    }

    const links = record.links_json
        ? JSON.parse(record.links_json)
        : record.link_url
            ? [{
                type: record.link_type || 'external_url',
                title: record.link_title || '',
                url: record.link_url
            }]
            : [];
    if (record.links_json && (record.link_url || record.link_title || record.link_type)) {
        throw new Error('Use either links_json or the single-link columns, not both.');
    }
    imported.links = validateLinks(links);

    const publishNow = parseBoolean(record.publish_now, 'publish_now');
    const notifyOnAssign = parseBoolean(record.notify_on_assign, 'notify_on_assign');
    const notifyOnGrade = parseBoolean(record.notify_on_grade, 'notify_on_grade');
    if (publishNow !== undefined) imported.publishNow = publishNow;
    if (notifyOnAssign !== undefined) imported.notifyOnAssign = notifyOnAssign;
    if (notifyOnGrade !== undefined) imported.notifyOnGrade = notifyOnGrade;

    if (record.notify_audience) {
        if (!['both', 'students', 'parents'].includes(record.notify_audience)) {
            throw new Error('notify_audience must be both, students, or parents.');
        }
        imported.notifyAudience = record.notify_audience;
    }

    return imported;
};

const csvCell = (value) => {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const buildAssignmentCsvTemplate = () => {
    const headers = [
        'assignment_type',
        'title',
        'due_date',
        'max_marks',
        'instructions',
        'links_json',
        'link_title',
        'link_url',
        'link_type',
        'publish_now',
        'notify_on_assign',
        'notify_audience',
        'notify_on_grade'
    ];
    const sample = [
        '',
        'Read chapter 3',
        '2026-10-30',
        '10',
        'Read and answer the questions.',
        JSON.stringify([{ type: 'external_url', title: 'Reading', url: 'https://example.com/reading' }]),
        '',
        '',
        '',
        'false',
        'true',
        'both',
        'true'
    ];
    return `\uFEFF${[headers, sample].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
};
