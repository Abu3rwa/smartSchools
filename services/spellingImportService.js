import crypto from 'crypto';
import { parse as parseCsv } from 'csv-parse/sync';
import SpellingImportJob from '../models/SpellingImportJob.js';
import { normalizeForGrading } from '../utils/spellingGrading.js';
import { isValidSpellingGrade, isValidSpellingWeek } from '../utils/spellingProgress.js';
import { domainError } from '../utils/spellingLibraryErrors.js';
import { ROUNDTRIP_HEADERS } from '../utils/spellingWordExport.js';
import { hashPayload } from '../utils/spellingPreviewToken.js';
import {
    CATEGORY_MAX_LENGTH,
    DEFINITION_MAX_LENGTH,
    IMPORT_MAX_ROWS,
    WORD_MAX_LENGTH
} from '../validators/spellingLibraryValidators.js';
import {
    commitLibraryImport,
    createImportPreviewState,
    issueImportPreviewToken
} from './spellingLibraryService.js';

const REQUIRED_HEADERS = ['grade', 'week', 'category', 'word', 'order'];
const DEFINITION_HEADER = 'definition';
const ENCODED_HEADERS = ROUNDTRIP_HEADERS.map((header) => header.toLowerCase());
const PREVIEW_TTL_MS = 15 * 60 * 1000;

const rowError = (row, message, field = 'row') => ({ row, field, message });
const csvInvalid = (message, details = null) => domainError('CSV_INVALID', {
    details: details || [{ field: 'file', message }]
});

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

/**
 * Parses the uploaded CSV with the real parser so quoted commas, escaped quotes
 * and multiline fields survive. Row numbers are the physical line where the
 * record ends, which stays correct after blank lines are skipped.
 */
export const parseSpellingCsv = (content) => {
    let records;
    try {
        records = parseCsv(String(content ?? ''), {
            bom: true,
            skip_empty_lines: true,
            trim: true,
            relax_column_count: true,
            on_record: (record, context) => ({ values: record, line: context.lines })
        });
    } catch (error) {
        throw csvInvalid('The CSV could not be read. Check quoted values and line breaks, then upload it again.', [
            { field: 'file', message: error.message }
        ]);
    }

    if (records.length < 2) throw csvInvalid('CSV must contain a header and at least one data row');

    const headers = records[0].values.map((header) => String(header).trim().toLowerCase());
    const isEncoded = headers.length === ENCODED_HEADERS.length
        && headers.every((header, index) => header === ENCODED_HEADERS[index]);
    const hasDefinition = headers.length === REQUIRED_HEADERS.length + 1
        && headers.at(-1) === DEFINITION_HEADER;
    const validHeaders = isEncoded || (headers.length === REQUIRED_HEADERS.length
        ? headers.every((header, index) => header === REQUIRED_HEADERS[index])
        : hasDefinition && REQUIRED_HEADERS.every((header, index) => header === REQUIRED_HEADERS[index]));
    if (!validHeaders) {
        throw csvInvalid(`CSV headers must match: ${[...REQUIRED_HEADERS, DEFINITION_HEADER].join(',')}`, [
            { field: 'header', message: `Expected: ${[...REQUIRED_HEADERS, DEFINITION_HEADER].join(',')}` }
        ]);
    }

    const expectedColumns = isEncoded || hasDefinition
        ? REQUIRED_HEADERS.length + 1
        : REQUIRED_HEADERS.length;
    const decodeCell = (value) => {
        const parsed = JSON.parse(String(value ?? ''));
        if (typeof parsed !== 'string') throw new Error('not a string');
        return parsed.trim();
    };
    return records.slice(1).map(({ values, line }) => {
        const row = {
            rowNumber: line,
            grade: String(values[0] ?? '').trim().toUpperCase(),
            week: String(values[1] ?? '').trim(),
            category: '',
            word: '',
            order: String(values[4] ?? '').trim()
        };
        if (isEncoded) {
            try {
                row.category = decodeCell(values[2]);
                row.word = decodeCell(values[3]);
                row.definition = decodeCell(values[5]);
            } catch (error) {
                void error;
                row.cellError = 'encoded value is not valid JSON';
            }
        } else {
            row.category = String(values[2] ?? '').trim();
            row.word = String(values[3] ?? '').trim();
            if (hasDefinition) row.definition = String(values[5] ?? '').trim();
        }
        if (values.length !== expectedColumns) row.columnError = 'wrong number of columns';
        return row;
    });
};

export const validateSpellingRows = (rows) => {
    const errors = [];
    const seenPositions = new Set();
    const seenWords = new Set();
    const validRows = [];

    for (const row of rows) {
        const week = Number(row.week);
        const order = Number(row.order);
        const normalizedWord = normalizeForGrading(row.word);
        const position = `${row.grade}:${row.week}:${order}`;
        const wordKey = `${row.grade}:${week}:${normalizedWord}`;
        const rowErrors = [];

        if (row.columnError) rowErrors.push(row.columnError);
        if (row.cellError) rowErrors.push(row.cellError);
        if (!isValidSpellingGrade(row.grade)) rowErrors.push('grade must be KG or G1-G5');
        if (!isValidSpellingWeek(row.grade, week)) rowErrors.push('week must be a valid week for this grade');
        if (!row.category || row.category.length > CATEGORY_MAX_LENGTH) {
            rowErrors.push(`category is required and must be at most ${CATEGORY_MAX_LENGTH} characters`);
        }
        if (!row.word || row.word.length > WORD_MAX_LENGTH) {
            rowErrors.push(`word is required and must be at most ${WORD_MAX_LENGTH} characters`);
        } else if (!normalizedWord) {
            rowErrors.push('word must contain letters or numbers');
        } else if (normalizedWord.length > WORD_MAX_LENGTH) {
            rowErrors.push(`word must be at most ${WORD_MAX_LENGTH} characters after normalization`);
        }
        if (Object.hasOwn(row, 'definition') && row.definition.length > DEFINITION_MAX_LENGTH) {
            rowErrors.push(`definition must be at most ${DEFINITION_MAX_LENGTH} characters`);
        }
        if (!Number.isInteger(order) || order < 1) rowErrors.push('order must be a positive integer');
        if (seenPositions.has(position)) rowErrors.push('duplicate grade/week/order in file');
        if (normalizedWord && seenWords.has(wordKey)) rowErrors.push('duplicate word in this grade and week');

        if (rowErrors.length > 0) {
            errors.push(...rowErrors.map((message) => rowError(row.rowNumber, message)));
        } else {
            seenPositions.add(position);
            seenWords.add(wordKey);
            const validRow = {
                grade: row.grade,
                week,
                category: row.category,
                word: row.word,
                normalizedWord,
                order
            };
            if (Object.hasOwn(row, 'definition')) validRow.definition = row.definition.trim();
            validRows.push(validRow);
        }
    }

    return { validRows, errors };
};

export const assertImportRowLimit = (rows) => {
    if (rows.length > IMPORT_MAX_ROWS) throw domainError('IMPORT_TOO_LARGE');
    return rows;
};

const buildSummary = (rows) => rows.reduce((summary, row) => {
    const key = `${row.grade}/week-${row.week}`;
    summary[key] = (summary[key] || 0) + 1;
    return summary;
}, {});

const normalizeMappings = (mappings, rows) => {
    if (!Array.isArray(mappings) || mappings.length === 0) return [];
    const rowNumbers = new Set(rows.map((row) => Number(row.rowNumber)));
    const seenRows = new Set();
    return mappings.map((mapping) => {
        const rowNumber = Number(mapping?.rowNumber);
        if (!rowNumbers.has(rowNumber)) {
            throw domainError('INVALID_REQUEST', { details: [{ row: rowNumber, field: 'identityMappings' }] });
        }
        if (seenRows.has(rowNumber)) {
            throw domainError('INVALID_REQUEST', {
                details: [{ row: rowNumber, field: 'identityMappings', message: 'each row once' }]
            });
        }
        seenRows.add(rowNumber);
        return {
            rowNumber,
            wordId: String(mapping.wordId),
            ...(mapping.expectedRevision !== undefined
                ? { expectedRevision: Number(mapping.expectedRevision) }
                : {}),
            ...(mapping.changeType ? { changeType: mapping.changeType } : {})
        };
    });
};

const proposedIdentities = ({ plan, rows }) => {
    const sourceIds = new Set((plan.sourceWords || []).map((word) => String(word._id)));
    const words = Object.values(plan.afterMap || {}).flat();
    return {
        proposedNewIds: words.filter((word) => !sourceIds.has(String(word._id))).map((word) => word._id),
        reusedWordIds: words.filter((word) => sourceIds.has(String(word._id))).map((word) => word._id),
        rowCount: rows.length
    };
};

const assertImportRole = (role) => {
    if (role !== 'admin' && role !== 'super_admin') throw domainError('ROLE_FORBIDDEN');
};

export async function previewSpellingImport({
    schoolId,
    userId,
    role,
    fileName,
    content,
    mode = 'merge',
    identityMappings = []
}) {
    assertImportRole(role);
    if (mode !== 'merge' && mode !== 'replace') {
        throw domainError('INVALID_REQUEST', { details: [{ field: 'mode' }] });
    }

    const rows = assertImportRowLimit(parseSpellingCsv(content));
    const { validRows, errors } = validateSpellingRows(rows);
    const mappings = normalizeMappings(identityMappings, rows);
    const fileHash = crypto.createHash('sha256').update(String(content ?? '')).digest('hex');
    const summary = { totalRows: rows.length, validRows: validRows.length, counts: buildSummary(validRows) };

    if (errors.length > 0) {
        const job = await SpellingImportJob.create({
            school: schoolId,
            uploadedBy: userId,
            fileName,
            fileHash,
            mode,
            rows: validRows,
            errors,
            summary,
            identityMappings: mappings,
            identityMappingDigest: hashPayload(mappings),
            expiresAt: new Date(Date.now() + PREVIEW_TTL_MS)
        });
        return {
            importId: job._id,
            fileHash,
            mode,
            summary,
            errors,
            previewRows: rows.slice(0, 5),
            committable: false
        };
    }

    const state = await createImportPreviewState({ schoolId, rows: validRows, mode, mappings });
    if (state.ambiguities?.length) {
        return {
            importId: null,
            fileHash,
            mode,
            summary,
            errors,
            previewRows: validRows.slice(0, 5),
            affectedGrades: state.grades,
            libraryVersions: state.libraryVersions,
            identityMappings: mappings,
            ambiguities: state.ambiguities,
            committable: false
        };
    }
    const identities = proposedIdentities({ plan: state.plan, rows: validRows });
    const job = await SpellingImportJob.create({
        school: schoolId,
        uploadedBy: userId,
        fileName,
        fileHash,
        mode,
        rows: validRows,
        errors,
        summary,
        identityMappings: mappings,
        identityMappingDigest: hashPayload(mappings),
        expectedLibraryVersions: state.libraryVersions,
        previewDigest: state.operationHash,
        expiresAt: new Date(Date.now() + PREVIEW_TTL_MS)
    });
    const previewToken = issueImportPreviewToken({
        schoolId,
        user: { _id: userId },
        operationHash: state.operationHash,
        digest: state.digest
    });

    return {
        importId: job._id,
        fileHash,
        mode,
        summary,
        errors,
        previewRows: validRows.slice(0, 5),
        affectedGrades: state.grades,
        planned: state.summary?.planned || null,
        replaceScope: state.summary?.replaceScope || null,
        impact: state.impact,
        libraryVersions: state.libraryVersions,
        identityMappings: mappings,
        previewToken,
        ...identities,
        committable: true
    };
}

// Both import modes write through the library coordinator so identity matching,
// guards, impact, versions and the audit record stay identical to manual edits.
export async function commitSpellingImport({ schoolId, user, role, importId, input }) {
    const job = await SpellingImportJob.findOne({ _id: importId, school: schoolId });
    if (!job) throw domainError('IMPORT_NOT_FOUND');
    const canonicalMappings = normalizeMappings(
        Array.isArray(input.identityMappings) ? input.identityMappings : (job.identityMappings || []),
        job.rows || []
    );
    const result = await commitLibraryImport({
        schoolId,
        user,
        role,
        job,
        input: { ...input, identityMappings: canonicalMappings, importId: job._id }
    });
    return {
        importId: job._id,
        mode: job.mode,
        counts: {
            added: result.addedWords?.length || 0,
            changed: result.changedWords?.length || 0,
            removed: result.removedIds?.length || 0
        },
        ...result
    };
}
