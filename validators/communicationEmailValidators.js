import { z } from 'zod';

const OBJECT_ID_PATTERN = /^[a-fA-F0-9]{24}$/;
const TONE_OPTIONS = ['professional', 'formal', 'warm', 'concise', 'friendly'];

const objectIdSchema = z.string().regex(OBJECT_ID_PATTERN, 'Invalid attachment id');
const tokenSelectionSchema = z.array(z.any());

export const communicationEmailSuggestionsQuerySchema = z.object({
    field: z.enum(['parents', 'teachers', 'students'], {
        error: 'field must be one of: parents, teachers, students'
    }),
    query: z.string().max(200).optional(),
    q: z.string().max(200).optional(),
    page: z.coerce.number().int().min(1, 'page must be a positive integer').optional(),
    limit: z.coerce.number().int().min(1).max(100, 'limit must be between 1 and 100').optional()
}).passthrough();

export const communicationEmailPreviewBodySchema = z.object({
    toParents: tokenSelectionSchema.optional(),
    toTeachers: tokenSelectionSchema.optional(),
    toStudents: tokenSelectionSchema.optional()
}).passthrough();

const optionalLanguageField = z.string().trim().max(12)
    .transform(v => v === '' ? undefined : v)
    .pipe(z.string().min(1).optional())
    .optional();

export const communicationEmailDraftBodySchema = z.object({
    prompt: z.string().trim().min(1).max(2000),
    tone: z.enum(TONE_OPTIONS).optional(),
    toParents: tokenSelectionSchema.optional(),
    toTeachers: tokenSelectionSchema.optional(),
    toStudents: tokenSelectionSchema.optional(),
    requestedLanguages: z.array(z.string().trim().min(1).max(12)).max(2).optional(),
    primaryLanguage: optionalLanguageField,
    secondaryLanguage: optionalLanguageField,
    language: optionalLanguageField
}).passthrough();

export const communicationEmailSendBodySchema = z.object({
    subject: z.string().trim().min(1).max(220),
    bodyHtml: z.string().optional(),
    body: z.string().optional(),
    toParents: tokenSelectionSchema.optional(),
    toTeachers: tokenSelectionSchema.optional(),
    toStudents: tokenSelectionSchema.optional(),
    attachmentIds: z.array(objectIdSchema).optional(),
    scheduledForLocal: z.string().trim().min(1).max(25).optional(),
    clientTimeZone: z.string().trim().min(1).max(100).optional()
}).passthrough();

export const communicationEmailHistoryQuerySchema = z.object({
    page: z.coerce.number().int().min(1, 'page must be a positive integer').optional(),
    limit: z.coerce.number().int().min(1).max(100, 'limit must be between 1 and 100').optional()
}).passthrough();

export const communicationEmailAttachmentParamsSchema = z.object({
    attachmentId: objectIdSchema
}).passthrough();
