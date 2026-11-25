import { z } from 'zod';
import { normalizeForGrading } from '../utils/spellingGrading.js';
import {
    isValidSpellingGrade,
    isValidSpellingWeek,
    SPELLING_CURRICULUM_GRADES
} from '../utils/spellingProgress.js';
import {
    domainError,
    isSpellingLibraryCode
} from '../utils/spellingLibraryErrors.js';

export const WORD_MAX_LENGTH = 200;
export const CATEGORY_MAX_LENGTH = 120;
export const DEFINITION_MAX_LENGTH = 2000;
export const REASON_MIN_LENGTH = 5;
export const REASON_MAX_LENGTH = 500;
export const BULK_MAX_OPERATIONS = 200;
export const IMPORT_MAX_ROWS = 5000;
export const LIST_MAX_PAGE_SIZE = 100;
export const LIST_LEGACY_MAX = 5000;
export const IMPACT_MAX_STUDENTS = 2000;
export const IMPACT_MAX_WORDS = 5000;

const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;

export const objectIdSchema = z.string().regex(OBJECT_ID_PATTERN, 'INVALID_ID');
export const gradeSchema = z.enum(SPELLING_CURRICULUM_GRADES, 'INVALID_FILTER');

const normalizedWordProblem = (value) => {
    const normalized = normalizeForGrading(value);
    if (!normalized) return true;
    return normalized.length > WORD_MAX_LENGTH;
};

export const wordSchema = z
    .string()
    .max(WORD_MAX_LENGTH, 'INVALID_WORD')
    .transform((value) => value.trim())
    .refine((value) => value.length >= 1 && value.length <= WORD_MAX_LENGTH, 'INVALID_WORD')
    .refine((value) => !normalizedWordProblem(value), 'INVALID_WORD');

export const categorySchema = z
    .string()
    .transform((value) => value.trim())
    .refine((value) => value.length >= 1 && value.length <= CATEGORY_MAX_LENGTH, 'INVALID_CATEGORY');

export const definitionSchema = z
    .string()
    .transform((value) => value.trim())
    .refine((value) => value.length <= DEFINITION_MAX_LENGTH, 'INVALID_DEFINITION');

export const reasonSchema = z
    .string()
    .transform((value) => value.trim())
    .refine(
        (value) => value.length >= REASON_MIN_LENGTH && value.length <= REASON_MAX_LENGTH,
        'INVALID_REQUEST'
    );

export const operationIdSchema = z.string().trim().min(8, 'INVALID_REQUEST').max(80, 'INVALID_REQUEST');

export const revisionSchema = z.number().int().min(1, 'STALE_REVISION');
export const libraryVersionSchema = z.number().int().min(1, 'STALE_LIBRARY');

const weekNumberSchema = z.number().int().min(1, 'INVALID_POSITION');
const orderSchema = z.number().int().min(1, 'INVALID_POSITION');

export const weekForGrade = (grade, week) => {
    if (!isValidSpellingWeek(grade, week)) throw domainError('INVALID_POSITION', {
        details: [{ field: 'week', grade }]
    });
    return week;
};

const parsedIssues = (error) => error.issues.map((issue) => ({
    field: Array.isArray(issue.path) && issue.path.length ? issue.path.join('.') : 'request',
    message: issue.message
}));

/**
 * Parse with Zod but surface the exact domain code. A schema message that is a
 * known code becomes the thrown code; anything else falls back to
 * INVALID_REQUEST with field details.
 */
export const parseDomainInput = (schema, value) => {
    const result = schema.safeParse(value);
    if (result.success) return result.data;
    const issues = parsedIssues(result.error);
    const firstCode = issues.find((issue) => isSpellingLibraryCode(issue.message))?.message;
    throw domainError(firstCode || 'INVALID_REQUEST', { details: issues });
};

const gradeWeekRefinement = (value) => {
    if (!isValidSpellingGrade(value.grade)) return false;
    return isValidSpellingWeek(value.grade, value.week);
};

export const listWordsQuerySchema = z.object({
    grade: gradeSchema.optional(),
    week: z.coerce.number().int().min(1, 'INVALID_FILTER').optional(),
    category: z.string().trim().max(CATEGORY_MAX_LENGTH, 'INVALID_FILTER').optional(),
    search: z.string().trim().max(WORD_MAX_LENGTH, 'INVALID_FILTER').optional(),
    page: z.coerce.number().int().min(1, 'INVALID_FILTER').optional(),
    pageSize: z.coerce.number().int().min(1, 'INVALID_FILTER').max(LIST_MAX_PAGE_SIZE, 'INVALID_FILTER').optional(),
    limit: z.coerce.number().int().min(1, 'INVALID_FILTER').max(LIST_LEGACY_MAX, 'INVALID_FILTER').optional(),
    includeArchived: z.enum(['true', 'false']).optional()
}).strict();

const patchFieldsSchema = z.object({
    word: wordSchema.optional(),
    definition: definitionSchema.optional(),
    category: categorySchema.optional(),
    week: weekNumberSchema.optional(),
    order: orderSchema.optional()
}).strict();

export const updateWordBodySchema = z.object({
    patch: patchFieldsSchema.optional(),
    // Phase-1 web clients sent `{ word }` directly. Accepting it keeps an
    // already-open tab working while every write still passes validation.
    word: wordSchema.optional(),
    definition: definitionSchema.optional(),
    category: categorySchema.optional(),
    changeType: z.enum(['typo']).optional(),
    expectedRevision: revisionSchema.optional(),
    expectedLibraryVersion: libraryVersionSchema.optional(),
    operationId: operationIdSchema.optional(),
    reason: reasonSchema.optional(),
    previewToken: z.string().max(16384).optional(),
    confirmImpact: z.boolean().optional()
}).strict()
    .transform((value) => {
        const patch = value.patch || {
            ...(value.word !== undefined ? { word: value.word } : {}),
            ...(value.definition !== undefined ? { definition: value.definition } : {}),
            ...(value.category !== undefined ? { category: value.category } : {})
        };
        return { ...value, patch };
    })
    .refine((value) => Object.keys(value.patch).length > 0, 'INVALID_REQUEST');

export const addWordBodySchema = z.object({
    grade: gradeSchema,
    week: weekNumberSchema,
    category: categorySchema,
    word: wordSchema,
    definition: definitionSchema.optional(),
    position: orderSchema.optional(),
    expectedLibraryVersion: libraryVersionSchema.optional(),
    operationId: operationIdSchema.optional(),
    reason: reasonSchema.optional(),
    previewToken: z.string().max(16384).optional(),
    confirmImpact: z.boolean().optional()
}).strict().refine(gradeWeekRefinement, 'INVALID_POSITION');

export const deleteWordBodySchema = z.object({
    expectedRevision: revisionSchema.optional(),
    expectedLibraryVersion: libraryVersionSchema.optional(),
    operationId: operationIdSchema.optional(),
    reason: reasonSchema.optional(),
    previewToken: z.string().max(16384).optional(),
    confirmImpact: z.boolean().optional()
}).strict();

export const reorderBodySchema = z.object({
    orderedWordIds: z.array(objectIdSchema).min(1, 'INVALID_ORDER').max(IMPORT_MAX_ROWS, 'INVALID_ORDER'),
    expectedRevisions: z.record(objectIdSchema, revisionSchema).optional(),
    expectedLibraryVersion: libraryVersionSchema.optional(),
    operationId: operationIdSchema.optional(),
    reason: reasonSchema.optional(),
    previewToken: z.string().max(16384).optional(),
    confirmImpact: z.boolean().optional()
}).strict();

export const moveWordBodySchema = z.object({
    toWeek: weekNumberSchema,
    toPosition: orderSchema,
    expectedRevision: revisionSchema.optional(),
    expectedLibraryVersion: libraryVersionSchema.optional(),
    operationId: operationIdSchema.optional(),
    reason: reasonSchema.optional(),
    previewToken: z.string().max(16384).optional(),
    confirmImpact: z.boolean().optional()
}).strict();

const bulkChangeSchema = z.object({
    wordId: objectIdSchema,
    expectedRevision: revisionSchema.optional(),
    patch: patchFieldsSchema,
    changeType: z.enum(['typo']).optional()
}).strict();

const bulkAddSchema = z.object({
    grade: gradeSchema,
    week: weekNumberSchema,
    category: categorySchema,
    word: wordSchema,
    definition: definitionSchema.optional(),
    position: orderSchema.optional()
}).strict();

export const bulkBodySchema = z.object({
    changes: z.array(bulkChangeSchema).max(BULK_MAX_OPERATIONS, 'BULK_TOO_LARGE').optional(),
    adds: z.array(bulkAddSchema).max(BULK_MAX_OPERATIONS, 'BULK_TOO_LARGE').optional(),
    removes: z.array(objectIdSchema).max(BULK_MAX_OPERATIONS, 'BULK_TOO_LARGE').optional(),
    expectedLibraryVersions: z.record(gradeSchema, libraryVersionSchema).optional(),
    operationId: operationIdSchema.optional(),
    reason: reasonSchema.optional(),
    previewToken: z.string().max(16384).optional(),
    confirmImpact: z.boolean().optional()
}).strict().refine((value) => {
    const total = (value.changes?.length || 0) + (value.adds?.length || 0) + (value.removes?.length || 0);
    return total > 0 && total <= BULK_MAX_OPERATIONS;
}, 'BULK_TOO_LARGE');

export const correctionBodySchema = z.object({
    expectedRevision: revisionSchema.optional(),
    targetCorrectionRevision: z.number().int().min(1).optional(),
    operationId: operationIdSchema.optional(),
    reason: reasonSchema.optional()
}).strict();

export const impactPreviewBodySchema = z.object({
    operation: z.object({
        kind: z.enum(['add', 'patch', 'remove', 'reorder', 'move', 'bulk']),
        wordId: objectIdSchema.optional(),
        grade: gradeSchema.optional(),
        week: weekNumberSchema.optional(),
        category: categorySchema.optional(),
        word: wordSchema.optional(),
        definition: definitionSchema.optional(),
        position: orderSchema.optional(),
        toWeek: weekNumberSchema.optional(),
        toPosition: orderSchema.optional(),
        patch: patchFieldsSchema.optional(),
        changeType: z.enum(['typo']).optional(),
        orderedWordIds: z.array(objectIdSchema).optional(),
        changes: z.array(bulkChangeSchema).optional(),
        adds: z.array(bulkAddSchema).optional(),
        removes: z.array(objectIdSchema).optional()
    }).strict(),
    expectedLibraryVersions: z.record(gradeSchema, libraryVersionSchema).optional(),
    expectedRevisions: z.record(objectIdSchema, revisionSchema).optional(),
    operationId: operationIdSchema.optional()
}).strict();

export const identityMappingSchema = z.object({
    rowNumber: z.number().int().min(2),
    wordId: objectIdSchema,
    expectedRevision: revisionSchema.optional(),
    changeType: z.enum(['archive-add', 'typo']).optional()
}).strict();

export const identityMappingsSchema = z.array(identityMappingSchema).max(IMPORT_MAX_ROWS);

export const importPreviewFieldsSchema = z.object({
    mode: z.enum(['merge', 'replace']).optional(),
    identityMappings: z.string().max(64 * 1024).optional()
}).passthrough();

export const importCommitBodySchema = z.object({
    importId: objectIdSchema,
    replace: z.boolean().optional(),
    expectedLibraryVersions: z.record(gradeSchema, libraryVersionSchema).optional(),
    identityMappings: identityMappingsSchema.optional(),
    operationId: operationIdSchema.optional(),
    reason: reasonSchema.optional(),
    previewToken: z.string().max(16384).optional(),
    confirmImpact: z.boolean().optional()
}).strict();

export const roundtripExportQuerySchema = z.object({
    format: z.enum(['spreadsheet', 'roundtrip']).optional(),
    grade: gradeSchema.optional()
}).strict();
