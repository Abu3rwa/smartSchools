import crypto from 'crypto';
import { withTransaction } from '../utils/withTransaction.js';
import SpellingImportJob from '../models/SpellingImportJob.js';
import SpellingWord from '../models/SpellingWord.js';
import SpellingSession from '../models/SpellingSession.js';
import SpellingClassSession from '../models/SpellingClassSession.js';
import { normalizeForGrading } from '../utils/spellingGrading.js';

const REQUIRED_HEADERS = ['grade', 'week', 'category', 'word', 'order'];
const DEFINITION_HEADER = 'definition';
const VALID_GRADES = new Set(['KG', 'G1', 'G2', 'G3', 'G4', 'G5']);

export const estimateSpellingReplacement = (existingWords, rows) => {
    const existingByWord = new Map();
    for (const word of existingWords) {
        const key = `${word.grade}:${word.normalizedWord}`;
        existingByWord.set(key, (existingByWord.get(key) || 0) + 1);
    }

    let keptRows = 0;
    for (const row of rows) {
        const key = `${row.grade}:${row.normalizedWord}`;
        const count = existingByWord.get(key) || 0;
        if (count > 0) {
            keptRows += 1;
            existingByWord.set(key, count - 1);
        }
    }

    return {
        removed: existingWords.length - keptRows,
        added: rows.length - keptRows
    };
};

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
    const hasDefinition = headers.length === REQUIRED_HEADERS.length + 1
        && headers.at(-1) === DEFINITION_HEADER;
    const validHeaders = headers.length === REQUIRED_HEADERS.length
        ? headers.every((header, index) => header === REQUIRED_HEADERS[index])
        : hasDefinition && REQUIRED_HEADERS.every((header, index) => headers[index] === header);
    if (!validHeaders) throw new Error(`CSV headers must match: ${[...REQUIRED_HEADERS, DEFINITION_HEADER].join(',')}`);

    return lines.slice(1).map((line, index) => {
        const rowNumber = index + 2;
        const values = parseCsvLine(line, rowNumber);
        const expectedColumns = hasDefinition ? REQUIRED_HEADERS.length + 1 : REQUIRED_HEADERS.length;
        if (values.length !== expectedColumns) {
            throw new Error(`Row ${rowNumber}: expected ${expectedColumns} columns`);
        }
        const row = {
            rowNumber,
            grade: values[0].trim().toUpperCase(),
            week: values[1].trim(),
            category: values[2].trim(),
            word: values[3].trim(),
            order: values[4].trim()
        };
        if (hasDefinition) row.definition = values[5].trim();
        return row;
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
        if (row.definition && row.definition.length > 2000) rowErrors.push('definition must be at most 2000 characters');
        if (!Number.isInteger(order) || order < 1) rowErrors.push('order must be a positive integer');
        if (seenPositions.has(position)) rowErrors.push('duplicate grade/week/order in file');

        if (rowErrors.length > 0) {
            errors.push(...rowErrors.map((message) => ({ row: row.rowNumber, field: 'row', message })));
        } else {
            seenPositions.add(position);
            const validRow = {
                grade: row.grade,
                week,
                category: row.category,
                word: row.word,
                normalizedWord: normalizeForGrading(row.word),
                order
            };
            if (Object.hasOwn(row, 'definition')) validRow.definition = row.definition.trim();
            validRows.push(validRow);
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
    const grades = [...new Set(validRows.map((row) => row.grade))];
    const existingWords = grades.length > 0
        ? await SpellingWord.find({ school: schoolId, grade: { $in: grades } }).select('grade normalizedWord').lean()
        : [];
    const replaceEstimate = estimateSpellingReplacement(existingWords, validRows);
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
        errors,
        previewRows: validRows.slice(0, 5),
        replaceEstimate
    };
}

// Replaces the full word list of every grade present in the file. A word that exists in both the
// old and new list (same text within the grade) keeps its _id, so students' completed-word history
// still matches it and it is not asked again. Attempts also keep their own word snapshot.
async function replaceSpellingWordLists({ schoolId, job }) {
    const grades = [...new Set(job.rows.map((row) => row.grade))];

    const activeSession = await SpellingSession.findOne({
        school: schoolId,
        curriculumGrade: { $in: grades },
        status: 'in-progress'
    }).select('_id').lean();
    if (activeSession) {
        throw Object.assign(
            new Error(`End all active spelling sessions for ${grades.join(', ')} before replacing its word list`),
            { statusCode: 409 }
        );
    }

    const result = await withTransaction(async (session) => {
        const oldWords = await SpellingWord.find({ school: schoolId, grade: { $in: grades } }).session(session).lean();
        const oldById = new Map(oldWords.map((word) => [String(word._id), word]));
        const idsByWord = new Map();
        for (const word of oldWords) {
            const key = `${word.grade}:${word.normalizedWord}`;
            if (!idsByWord.has(key)) idsByWord.set(key, []);
            idsByWord.get(key).push(word._id);
        }

        const newDocs = job.rows.map((row) => {
            const plain = typeof row.toObject === 'function' ? row.toObject() : { ...row };
            delete plain._id;
            const reusable = idsByWord.get(`${plain.grade}:${plain.normalizedWord}`)?.shift();
            const previous = reusable ? oldById.get(String(reusable)) : null;
            return {
                ...plain,
                ...(reusable ? { _id: reusable } : {}),
                definition: plain.definition ?? previous?.definition ?? '',
                school: schoolId,
                sourceImportId: job._id
            };
        });

        const groups = await SpellingClassSession.find({
            school: schoolId,
            grade: { $in: grades },
            status: 'in-progress'
        }).session(session);
        const groupPositions = groups.map((group) => ({ group, position: oldById.get(String(group.currentWord)) }));

        const keptCount = newDocs.filter((doc) => doc._id).length;
        await SpellingWord.deleteMany({ school: schoolId, grade: { $in: grades } }, { session });
        if (newDocs.length > 0) await SpellingWord.insertMany(newDocs, { session, ordered: true });

        // Keep each class on (or after) the position it was at in the old list.
        for (const { group, position } of groupPositions) {
            const next = await SpellingWord.findOne({
                school: schoolId,
                grade: group.grade,
                ...(position ? { $or: [{ week: { $gt: position.week } }, { week: position.week, order: { $gte: position.order } }] } : {})
            }).sort({ week: 1, order: 1 }).session(session).lean();
            if (next) {
                group.currentWord = next._id;
                for (const participant of group.participants) {
                    participant.submittedWord = null;
                    participant.correct = false;
                }
            } else {
                group.status = 'completed';
            }
            await group.save({ session });
        }

        job.status = 'committed';
        job.committedAt = new Date();
        await job.save({ session });
        return {
            importedRows: newDocs.length,
            insertedRows: newDocs.length - keptCount,
            updatedRows: keptCount,
            removedRows: oldWords.length - keptCount
        };
    });

    return { importId: job._id, idempotent: false, replaced: true, grades, ...result };
}

export async function commitSpellingImport({ schoolId, importId, replace = false }) {
    const job = await SpellingImportJob.findOne({ _id: importId, school: schoolId });
    if (!job) throw Object.assign(new Error('Spelling import preview not found'), { statusCode: 404 });
    if (job.status === 'committed') return { importId: job._id, idempotent: true, importedRows: job.rows.length };
    if (job.status !== 'preview') throw Object.assign(new Error('Spelling import is not available for commit'), { statusCode: 409 });
    if (job.errors.length > 0) throw Object.assign(new Error('Fix CSV validation errors before committing'), { statusCode: 400 });

    if (replace) return replaceSpellingWordLists({ schoolId, job });

    const importedRows = await withTransaction(async (session) => {
        const operations = job.rows.map((row) => ({
            updateOne: {
                filter: { school: schoolId, grade: row.grade, week: row.week, order: row.order },
                update: { $set: { ...row, school: schoolId, sourceImportId: job._id } },
                upsert: true
            }
        }));
        const result = operations.length > 0
            ? await SpellingWord.bulkWrite(operations, { session, ordered: true })
            : { matchedCount: 0, upsertedCount: 0 };
        job.status = 'committed';
        job.committedAt = new Date();
        await job.save({ session });
        return {
            importedRows: operations.length,
            updatedRows: result.matchedCount || 0,
            insertedRows: result.upsertedCount || 0
        };
    });

    return { importId: job._id, idempotent: false, ...importedRows };
}
