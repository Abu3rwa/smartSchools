import { z } from 'zod';
import {
    TEACHER_BEHAVIOR_CATEGORY_KEYS,
    TEACHER_BEHAVIOR_SEVERITIES,
    TEACHER_BEHAVIOR_RANGES
} from '../constants/teacherBehavior.js';

const OBJECT_ID_PATTERN = /^[a-fA-F0-9]{24}$/;

export const teacherBehaviorObjectId = z.string()
    .regex(OBJECT_ID_PATTERN, 'Select a valid record.');

const isoDate = z.union([z.string(), z.date()]);

export const teacherBehaviorEntryBodySchema = z.object({
    student: teacherBehaviorObjectId,
    category: z.enum(TEACHER_BEHAVIOR_CATEGORY_KEYS, {
        errorMap: () => ({ message: 'Select a category.' })
    }),
    severity: z.enum(TEACHER_BEHAVIOR_SEVERITIES, {
        errorMap: () => ({ message: 'Select a severity.' })
    }),
    notes: z.string().trim().max(1000, 'Keep the note to 1,000 characters or fewer.').optional(),
    otherStudents: z.array(teacherBehaviorObjectId).max(10, 'Add up to 10 other students.').optional(),
    occurredAt: isoDate.optional(),
    followUp: z.boolean().optional()
}).strict().superRefine((payload, context) => {
    if (payload.severity === 'serious' && !String(payload.notes || '').trim()) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['notes'],
            message: 'Add a short note explaining this serious case.'
        });
    }

    if (payload.occurredAt !== undefined) {
        const date = new Date(payload.occurredAt);
        if (Number.isNaN(date.getTime())) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['occurredAt'],
                message: 'Choose a valid date and time.'
            });
            return;
        }
        if (date.getTime() > Date.now() + 5 * 60 * 1000) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['occurredAt'],
                message: 'The date cannot be in the future.'
            });
        }
    }
});

export const teacherBehaviorEntriesQuerySchema = z.object({
    range: z.enum(TEACHER_BEHAVIOR_RANGES, {
        errorMap: () => ({ message: 'Choose today, this week or all.' })
    }).optional(),
    student: teacherBehaviorObjectId.optional(),
    severity: z.enum(TEACHER_BEHAVIOR_SEVERITIES, {
        errorMap: () => ({ message: 'Choose minor, moderate or serious.' })
    }).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional()
}).strict();

export const teacherBehaviorStudentParamSchema = z.object({
    studentId: teacherBehaviorObjectId
}).strict();

export const teacherBehaviorEntryParamSchema = z.object({
    id: z.string().regex(OBJECT_ID_PATTERN, 'Select a valid record.')
}).strict();

export const teacherBehaviorFollowUpBodySchema = z.object({
    note: z.string().trim().max(500, 'Keep the follow-up note to 500 characters or fewer.').optional()
}).strict();

const firstIssue = (error) => error.issues?.[0]?.message || 'Please check the form and try again.';

/**
 * A local validator so the teacher stops seeing the shared middleware's
 * generic "Validation failed": the first plain-language issue becomes the
 * response message, which is what the mobile app shows.
 */
export const validateTeacherBehavior = ({
    bodySchema = null,
    querySchema = null,
    paramsSchema = null
} = {}) => (req, res, next) => {
    for (const [schema, value, assign] of [
        [bodySchema, req.body ?? {}, (parsed) => { req.body = parsed; }],
        [querySchema, req.query ?? {}, (parsed) => { req.query = parsed; }],
        [paramsSchema, req.params ?? {}, (parsed) => { req.params = parsed; }]
    ]) {
        if (!schema) continue;
        const parsed = schema.safeParse(value);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                message: firstIssue(parsed.error),
                errors: parsed.error.issues.map((issue) => ({
                    field: issue.path.join('.'),
                    message: issue.message
                }))
            });
        }
        assign(parsed.data);
    }
    return next();
};
