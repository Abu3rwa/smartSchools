import crypto from 'crypto';
import { withTransaction } from '../utils/withTransaction.js';
import SpellingImportJob from '../models/SpellingImportJob.js';
import SpellingWord from '../models/SpellingWord.js';
import { normalizeForGrading } from '../utils/spellingGrading.js';

const REQUIRED_HEADERS = ['grade', 'week', 'category', 'word', 'order'];
const VALID_GRADES = new Set(['KG', 'G1', 'G2', 'G3', 'G4', 'G5']);

const parseCsvLine = (line, rowNumber) => {
    const values = [];
    let value = '';
    let quoted = false;

    for (let index = 0; index < line.length; index += 1) {
        const character = line[index];
        const nextCharacter = line[index + 1];
        if (character === '"' && quoted && nextCharacter === '"') {
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

    if (quoted) {
        throw new Error(`Row ${rowNumber}: quoted value was not closed`);
    }

    values.push(value);
    return values;
};

export const parseSpellingCsv = (content) => {
    const lines = String(content || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim() !== '');
    if (lines.length < 2) throw new Error('CSV must contain a header and at least one data row');

    const headers = parseCsvLine(lines[0], 1).map((header) => header.trim().toLowerCase());
    if (headers.length !== REQUIRED_HEADERS.length || headers.some((header, index) => header !== REQUIRED_HEADERS[index])) {
        throw new Error(`CSV headers must exactly match: ${REQUIRED_HEADERS.join(',')}`);
    }

    return lines.slice(1).map((line, index) => {
        const rowNumber = index + 2;
        const values = parseCsvLine(line, rowNumber);
        if (values.length !== REQUIRED_HEADERS.length) {
            throw new Error(`Row ${rowNumber}: expected ${REQUIRED_HEADERS.length} columns`);
        }
        return {
            rowNumber,
            grade: values[0].trim().toUpperCase(),
            week: values[1].trim(),
            category: values[2].trim(),
            word: values[3].trim(),
            order: values[4].trim()
        };
    });
};

export const validateSpellingRows = (rows) => {
    const errors = [];
    const seenPositions = new Set();
    const validRows = [];

    for (const row of rows) {
        const week = Number(row.week);
        const order = Number(row.order);
        const position = `${row.grade}:${week}:${order}`;
        const rowErrors = [];

        if (!VALID_GRADES.has(row.grade)) rowErrors.push('grade must be KG or G1-G5');
        if (!Number.isInteger(week) || week < 1) rowErrors.push('week must be a positive integer');
        if (!row.category || row.category.length > 120) rowErrors.push('category is required and must be at most 120 characters');
        if (!row.word || row.word.length > 200) rowErrors.push('word is required and must be at most 200 characters');
        if (!Number.isInteger(order) || order < 1) rowErrors.push('order must be a positive integer');
        if (seenPositions.has(position)) rowErrors.push('duplicate grade/week/order in file');

        if (rowErrors.length > 0) {
            errors.push(...rowErrors.map((message) => ({ row: row.rowNumber, field: 'row', message })));
        } else {
            seenPositions.add(position);
            validRows.push({
                grade: row.grade,
                week,
                category: row.category,
                word: row.word,
                normalizedWord: normalizeForGrading(row.word),
                order
            });
        }
    }

    return { validRows, errors };
};

const buildSummary = (rows) => rows.reduce((summary, row) => {
    const key = `${row.grade}/week-${row.week}`;
    summary[key] = (summary[key] || 0) + 1;
    return summary;
}, {});

export async function previewSpellingImport({ schoolId, userId, fileName, content }) {
    const rows = parseSpellingCsv(content);
    const { validRows, errors } = validateSpellingRows(rows);
    const fileHash = crypto.createHash('sha256').update(String(content)).digest('hex');
    const job = await SpellingImportJob.create({
        school: schoolId,
        uploadedBy: userId,
        fileName,
        fileHash,
        rows: validRows,
        errors,
        summary: { totalRows: rows.length, validRows: validRows.length, counts: buildSummary(validRows) }
    });

    return {
        importId: job._id,
        fileHash,
        summary: job.summary,
        errors
    };
}

export async function commitSpellingImport({ schoolId, importId }) {
    const job = await SpellingImportJob.findOne({ _id: importId, school: schoolId });
    if (!job) throw Object.assign(new Error('Spelling import preview not found'), { statusCode: 404 });
    if (job.status === 'committed') return { importId: job._id, idempotent: true, importedRows: job.rows.length };
    if (job.status !== 'preview') throw Object.assign(new Error('Spelling import is not available for commit'), { statusCode: 409 });
    if (job.errors.length > 0) throw Object.assign(new Error('Fix CSV validation errors before committing'), { statusCode: 400 });

    const importedRows = await withTransaction(async (session) => {
        const operations = job.rows.map((row) => ({
            updateOne: {
                filter: { school: schoolId, grade: row.grade, week: row.week, order: row.order },
                update: { $set: { ...row, school: schoolId, sourceImportId: job._id } },
                upsert: true
            }
        }));
        if (operations.length > 0) await SpellingWord.bulkWrite(operations, { session, ordered: true });
        job.status = 'committed';
        job.committedAt = new Date();
        await job.save({ session });
        return operations.length;
    });

    return { importId: job._id, idempotent: false, importedRows };
}
