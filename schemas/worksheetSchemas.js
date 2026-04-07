import { z } from 'zod';

export const MARKING_MODES = ['model', 'ai', 'hybrid'];
export const WORKSHEET_STATUSES = ['draft', 'processing', 'review', 'published', 'archived'];
export const ANSWER_TYPES = ['multiple_choice', 'short_answer', 'true_false', 'numeric', 'essay', 'fill_blank'];
export const FEEDBACK_LEVELS = ['none', 'basic', 'detailed'];
export const GRADEBOOK_SYNC_MODES = ['manual', 'prompt', 'auto'];
export const SCOPE_TYPES = ['school', 'department', 'subject', 'grade', 'teacher'];
export const LANGUAGES = ['en', 'ar', 'fr', 'es', 'pt', 'tr', 'ur'];

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const objectId = z.string().regex(objectIdRegex, 'Invalid ObjectId');

// ─── Create Worksheet ─────────────────────────────────────────────────────────
export const createWorksheetSchema = z.object({
    classId: objectId,
    subjectId: objectId,
    academicYear: objectId,
    title: z.string().min(1).max(200),
    description: z.string().max(1000).optional(),
    language: z.enum(LANGUAGES).optional().default('en'),
    markingMode: z.enum(MARKING_MODES).optional().default('hybrid'),
    totalQuestions: z.number().int().min(1).max(200).nullable().optional(),
    maxScore: z.number().min(1).max(1000).nullable().optional(),
    gradeLevel: z.string().max(50).optional(),
    modelAnswers: z.array(z.object({
        questionNumber: z.number().int().min(1),
        answer: z.string().min(1),
        acceptableAlternatives: z.array(z.string()).optional().default([]),
        pointsTotal: z.number().min(0).max(100).optional().default(1)
    })).optional()
}).strict();

// ─── Update Worksheet ─────────────────────────────────────────────────────────
export const updateWorksheetSchema = z.object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(1000).optional(),
    language: z.enum(LANGUAGES).optional(),
    markingMode: z.enum(MARKING_MODES).optional(),
    totalQuestions: z.number().int().min(1).max(200).nullable().optional(),
    maxScore: z.number().min(1).max(1000).nullable().optional(),
    gradeLevel: z.string().max(50).optional(),
    modelAnswers: z.array(z.object({
        questionNumber: z.number().int().min(1),
        answer: z.string().min(1),
        acceptableAlternatives: z.array(z.string()).optional().default([]),
        pointsTotal: z.number().min(0).max(100).optional().default(1)
    })).optional(),
    questionMappings: z.array(z.object({
        questionNumber: z.number().int().min(1),
        standardId: objectId.optional(),
        standardConfirmed: z.boolean().optional(),
        pointsTotal: z.number().min(0).max(100).optional(),
        answerType: z.enum(ANSWER_TYPES).optional()
    })).optional()
}).strict();

// ─── Add Submission ───────────────────────────────────────────────────────────
export const addSubmissionSchema = z.object({
    studentId: objectId
}).strict();

// ─── Assign Student to Submission ─────────────────────────────────────────────
export const assignStudentSchema = z.object({
    studentId: objectId
}).strict();

// ─── Teacher Override ─────────────────────────────────────────────────────────
export const overrideSchema = z.object({
    overrides: z.array(z.object({
        questionNumber: z.number().int().min(1),
        pointsEarned: z.number().min(0).optional(),
        isCorrect: z.boolean().optional(),
        feedback: z.string().max(500).optional(),
        reason: z.string().max(500).optional()
    })).min(1).max(200)
}).strict();

// ─── Update Status ────────────────────────────────────────────────────────────
export const updateStatusSchema = z.object({
    status: z.enum(WORKSHEET_STATUSES)
}).strict();

// ─── Config Update ────────────────────────────────────────────────────────────
export const configUpdateSchema = z.object({
    scopeType: z.enum(SCOPE_TYPES),
    scopeId: objectId,
    feedbackLevel: z.enum(FEEDBACK_LEVELS).optional(),
    partialCreditEnabled: z.boolean().optional(),
    spellingTolerance: z.enum(['strict', 'moderate', 'lenient']).optional(),
    defaultMarkingMode: z.enum(MARKING_MODES).optional(),
    aiConfidenceThreshold: z.number().min(0).max(1).optional(),
    teacherOverrideRequired: z.boolean().optional(),
    gradebookSyncMode: z.enum(GRADEBOOK_SYNC_MODES).optional(),
    autoStandardsDetection: z.boolean().optional(),
    autoStandardsRecording: z.boolean().optional(),
    parentCommunicationEnabled: z.boolean().optional(),
    parentViewMode: z.enum(['score_only', 'detailed', 'full']).optional(),
    parentAlertEnabled: z.boolean().optional(),
    parentAlertThreshold: z.number().min(0).max(100).optional(),
    studentCommunicationEnabled: z.boolean().optional(),
    studentViewMode: z.enum(['score_only', 'detailed', 'full']).optional(),
    correctAnswerRevealTiming: z.enum(['immediate', 'after_review', 'never']).optional(),
    lockedFields: z.array(z.string()).optional()
}).strict();

// ─── Gradebook Sync ───────────────────────────────────────────────────────────
export const gradebookSyncSchema = z.object({
    submissionIds: z.array(objectId).min(1).max(500).optional()
}).strict();

// ─── List Query ───────────────────────────────────────────────────────────────
export const listQuerySchema = z.object({
    classId: objectId.optional(),
    subject: objectId.optional(),
    status: z.enum(WORKSHEET_STATUSES).optional(),
    academicYear: objectId.optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20)
}).strict();
