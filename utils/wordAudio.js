export const ALLOWED_AUDIO_HOSTS = Object.freeze([
    'www.ldoceonline.com',
    'www.oxfordlearnersdictionaries.com',
    'media.merriam-webster.com'
]);

export const DICTIONARIES = Object.freeze(['longman', 'oxford', 'webster']);

// CSV header (lowercase) -> pronunciation field on the wordAudio document
export const PRONUNCIATION_COLUMNS = Object.freeze({
    'longman us': 'longmanUS',
    'longman uk': 'longmanUK',
    'oxford us': 'oxfordUS',
    'oxford uk': 'oxfordUK',
    'webster us': 'websterUS'
});

export const PRONUNCIATION_FIELDS = Object.freeze(Object.values(PRONUNCIATION_COLUMNS));
const MAX_URL_LENGTH = 500;

// Trim, lowercase, treat hyphens as spaces, collapse spaces; apostrophes are kept.
export const normalizeWordKey = (word) => String(word ?? '')
    .normalize('NFKC')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[-\u2010-\u2015]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

export const validateAudioUrl = (value) => {
    const raw = String(value ?? '').trim();
    if (!raw) return { ok: true, empty: true, url: '' };
    if (raw.length > MAX_URL_LENGTH) return { ok: false, url: raw, reason: 'URL too long' };
    let parsed;
    try {
        parsed = new URL(raw);
    } catch {
        return { ok: false, url: raw, reason: 'Not a valid URL' };
    }
    if (parsed.protocol !== 'https:') return { ok: false, url: raw, reason: 'URL must be https' };
    if (parsed.username || parsed.password || parsed.port) return { ok: false, url: raw, reason: 'URL must not include credentials or a port' };
    if (!ALLOWED_AUDIO_HOSTS.includes(parsed.hostname.toLowerCase())) return { ok: false, url: raw, reason: `Host not allowed: ${parsed.hostname}` };
    return { ok: true, empty: false, url: parsed.toString() };
};

const parseCsvLine = (line, rowNumber) => {
    const values = [];
    let value = '';
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
        const character = line[index];
        if (character === '"' && quoted && line[index + 1] === '"') {
            value += '"';
            index += 1;
        } else if (character === '"') {
            quoted = !quoted;
        } else if (character === ',' && !quoted) {
            values.push(value);
            value = '';
        } else {
            value += character;
        }
    }
    if (quoted) throw new Error(`Row ${rowNumber}: quoted value was not closed`);
    values.push(value);
    return values;
};

const EXAMPLE_HEADER = /^(longman|oxford|webster) examples?(?: \d+)?$/;

/**
 * Columns (case-insensitive, any order): word, Longman US, Longman UK, Oxford US, Oxford UK, Webster US,
 * status, first week, definition (optional), "<Dictionary> example 1..n" (optional; a cell may hold several
 * URLs separated by "|"). Unknown columns are ignored.
 */
export const parseWordAudioCsv = (content) => {
    const lines = String(content || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim() !== '');
    if (lines.length < 2) throw new Error('CSV must contain a header and at least one data row');
    const headers = parseCsvLine(lines[0], 1).map((header) => header.trim().toLowerCase().replace(/\s+/g, ' '));
    const wordIndex = headers.indexOf('word');
    if (wordIndex === -1) throw new Error('CSV must contain a "word" column');

    const pronunciationIndexes = headers
        .map((header, index) => [PRONUNCIATION_COLUMNS[header], index])
        .filter(([field]) => field);
    const exampleIndexes = headers
        .map((header, index) => [EXAMPLE_HEADER.exec(header)?.[1], index])
        .filter(([dictionary]) => dictionary);
    const definitionIndex = headers.indexOf('definition');
    const statusIndex = headers.indexOf('status');

    return lines.slice(1).map((line, index) => {
        const rowNumber = index + 2;
        const values = parseCsvLine(line, rowNumber);
        const cell = (position) => (position >= 0 ? String(values[position] ?? '').trim() : '');
        const row = {
            rowNumber,
            word: cell(wordIndex),
            status: cell(statusIndex),
            definition: cell(definitionIndex),
            pronunciations: {},
            examples: { longman: [], oxford: [], webster: [] }
        };
        for (const [field, position] of pronunciationIndexes) row.pronunciations[field] = cell(position);
        for (const [dictionary, position] of exampleIndexes) {
            row.examples[dictionary].push(...cell(position).split('|').map((item) => item.trim()).filter(Boolean));
        }
        return row;
    });
};

const mergeUnique = (current = [], incoming = []) => {
    const merged = [...current];
    for (const url of incoming) if (!merged.includes(url)) merged.push(url);
    return merged;
};

/**
 * Pure planner. Merges rows by normalized word, validates URLs and compares with existing docs.
 * Never lets an empty cell erase stored data; example URLs are only ever added.
 */
export const planWordAudioImport = (rows, existingByWord = new Map()) => {
    const report = { rowsRead: rows.length, rowsWithAudio: 0, rowsSkipped: 0, urlsRejected: [], skipped: [] };
    const merged = new Map();

    for (const row of rows) {
        const key = normalizeWordKey(row.word);
        if (!key || key.length > 200) {
            report.rowsSkipped += 1;
            report.skipped.push({ row: row.rowNumber, reason: 'Missing or invalid word' });
            continue;
        }
        const patch = { pronunciations: {}, examples: { longman: [], oxford: [], webster: [] } };
        let hasUrl = false;
        const accept = (rawUrl, label, assign) => {
            const result = validateAudioUrl(rawUrl);
            if (result.empty) return;
            if (!result.ok) {
                report.urlsRejected.push({ row: row.rowNumber, word: key, field: label, url: result.url, reason: result.reason });
                return;
            }
            hasUrl = true;
            assign(result.url);
        };
        for (const [field, rawUrl] of Object.entries(row.pronunciations)) {
            accept(rawUrl, field, (url) => { patch.pronunciations[field] = url; });
        }
        for (const dictionary of DICTIONARIES) {
            for (const rawUrl of row.examples[dictionary]) {
                accept(rawUrl, `${dictionary}Example`, (url) => { patch.examples[dictionary] = mergeUnique(patch.examples[dictionary], [url]); });
            }
        }
        if (hasUrl) report.rowsWithAudio += 1;

        const target = merged.get(key) || { word: key, pronunciations: {}, examples: { longman: [], oxford: [], webster: [] }, definition: '' };
        Object.assign(target.pronunciations, patch.pronunciations);
        for (const dictionary of DICTIONARIES) target.examples[dictionary] = mergeUnique(target.examples[dictionary], patch.examples[dictionary]);
        if (row.definition) target.definition = row.definition.slice(0, 2000);
        merged.set(key, target);
    }

    const operations = [];
    let unchanged = 0;
    for (const entry of merged.values()) {
        const hasData = Object.keys(entry.pronunciations).length > 0
            || DICTIONARIES.some((dictionary) => entry.examples[dictionary].length > 0)
            || entry.definition;
        if (!hasData) continue;
        const existing = existingByWord.get(entry.word);
        const set = {};
        for (const [field, url] of Object.entries(entry.pronunciations)) {
            if (!existing || existing[field] !== url) set[field] = url;
        }
        for (const dictionary of DICTIONARIES) {
            const before = existing?.examples?.[dictionary] || [];
            const after = mergeUnique(before, entry.examples[dictionary]);
            if (after.length !== before.length) set[`examples.${dictionary}`] = after;
        }
        if (entry.definition && (!existing || existing.definition !== entry.definition)) set.definition = entry.definition;

        if (Object.keys(set).length === 0) {
            unchanged += 1;
            continue;
        }
        operations.push({ word: entry.word, isNew: !existing, set });
    }

    return { operations, unchanged, report };
};
