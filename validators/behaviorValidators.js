import { z } from 'zod';
import {
    BEHAVIOR_TASK_TYPES,
    BEHAVIOR_VERIFIER_RULES,
    BEHAVIOR_OVERFLOW_BEHAVIORS,
    BEHAVIOR_INCIDENT_STATUSES,
    BEHAVIOR_TASK_STATUSES,
    BEHAVIOR_COUNTING_MODES
} from '../constants/behavior.js';

const OBJECT_ID_PATTERN = /^[a-fA-F0-9]{24}$/;
export const behaviorObjectId = z.string().regex(OBJECT_ID_PATTERN, 'Invalid id');

const optionalId = behaviorObjectId.nullable().optional();
const isoDate = z.union([z.string(), z.date()]);

export const behaviorPreviewQuerySchema = z.object({
    studentId: behaviorObjectId,
    behaviorTypeId: behaviorObjectId,
    occurredAt: isoDate.optional()
}).passthrough();

export const behaviorIncidentLogBodySchema = z.object({
    student: behaviorObjectId,
    behaviorType: behaviorObjectId,
    occurredAt: isoDate.optional(),
    staffNotes: z.string().trim().max(4000).optional(),
    otherStudentsInvolved: z.array(behaviorObjectId).max(30).optional(),
    appliedStepOrder: z.coerce.number().int().min(1).max(20).optional(),
    overrideReason: z.string().trim().max(1000).optional(),
    isSerious: z.boolean().optional(),
    seriousReason: z.string().trim().max(1000).optional(),
    mergeInto: optionalId
}).passthrough();

export const behaviorIncidentsQuerySchema = z.object({
    status: z.enum(BEHAVIOR_INCIDENT_STATUSES).optional(),
    student: behaviorObjectId.optional(),
    behaviorType: behaviorObjectId.optional(),
    class: behaviorObjectId.optional(),
    reportedBy: behaviorObjectId.optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    flagged: z.enum(['true', 'false']).optional(),
    serious: z.enum(['true', 'false']).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    skip: z.coerce.number().int().min(0).optional()
}).passthrough();

export const behaviorApprovalBodySchema = z.object({
    decision: z.enum(['approved', 'rejected']),
    comment: z.string().trim().max(1000).optional(),
    draftEdits: z.object({
        subject: z.string().trim().max(300).optional(),
        body: z.string().trim().max(20000).optional()
    }).optional()
}).passthrough();

export const behaviorVoidBodySchema = z.object({
    reason: z.string().trim().min(1, 'A void needs a reason').max(1000)
}).passthrough();

export const behaviorMergeBodySchema = z.object({
    sourceId: optionalId,
    targetId: behaviorObjectId,
    pending: z.object({
        studentId: behaviorObjectId.optional(),
        behaviorTypeId: behaviorObjectId.optional(),
        occurredAt: isoDate.optional()
    }).optional()
}).passthrough();

export const behaviorCountResetBodySchema = z.object({
    studentId: behaviorObjectId,
    behaviorTypeId: optionalId,
    reason: z.string().trim().min(1, 'A reset needs a reason').max(1000)
}).passthrough();

export const behaviorTasksQuerySchema = z.object({
    status: z.enum(BEHAVIOR_TASK_STATUSES).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    skip: z.coerce.number().int().min(0).optional()
}).passthrough();

export const behaviorTaskSubmitBodySchema = z.object({
    text: z.string().trim().max(20000, 'This answer is too long').optional(),
    answers: z.array(z.object({
        question: z.string().trim().max(500).optional(),
        answer: z.string().trim().max(4000).optional()
    })).max(20).optional()
}).passthrough();

export const behaviorTaskVerifyBodySchema = z.object({
    decision: z.enum(['completed', 'needs_revision', 'waived']),
    comment: z.string().trim().max(1000).optional()
}).passthrough();

const consequenceSchema = z.object({
    taskType: z.enum(BEHAVIOR_TASK_TYPES),
    title: z.string().trim().min(1, 'Every consequence needs a title').max(200),
    instructions: z.string().trim().max(2000).optional(),
    dueInDays: z.coerce.number().min(0).max(120).optional(),
    minWords: z.coerce.number().min(0).max(2000).optional(),
    toWhom: z.enum(['person-affected', 'school', 'self']).nullable().optional(),
    questions: z.array(z.string().trim().max(500)).max(20).optional(),
    verifierRule: z.enum(BEHAVIOR_VERIFIER_RULES).nullable().optional(),
    requiresHumanDecision: z.boolean().optional()
}).passthrough();

const stepSchema = z.object({
    order: z.coerce.number().int().min(1).max(20),
    title: z.string().trim().min(1, 'Each step needs a title').max(200),
    summary: z.string().trim().max(1000).optional(),
    consequences: z.array(consequenceSchema).max(12).optional(),
    actions: z.object({
        emailParents: z.boolean().optional(),
        showInPortal: z.boolean().optional(),
        ccRoles: z.array(z.string().trim().max(60)).max(10).optional()
    }).partial().optional(),
    requiresApproval: z.boolean().nullable().optional(),
    approverRoles: z.array(z.string().trim().max(60)).max(10).optional(),
    emailTemplateKey: z.string().trim().max(120).nullable().optional()
}).passthrough();

export const behaviorLadderSaveBodySchema = z.object({
    name: z.string().trim().min(1, 'Ladder name is required').max(200),
    behaviorType: optionalId,
    overflowBehavior: z.enum(BEHAVIOR_OVERFLOW_BEHAVIORS).optional(),
    steps: z.array(stepSchema).max(20)
}).passthrough();

export const behaviorTypeCreateBodySchema = z.object({
    name: z.string().trim().min(1, 'Behavior name is required').max(200),
    description: z.string().trim().max(1000).optional(),
    level: z.coerce.number().int().min(1).max(4),
    active: z.boolean().optional(),
    ladder: optionalId
}).passthrough();

export const behaviorTypeUpdateBodySchema = z.object({
    name: z.string().trim().min(1, 'Behavior name is required').max(200).optional(),
    description: z.string().trim().max(1000).optional(),
    level: z.coerce.number().int().min(1).max(4).optional(),
    active: z.boolean().optional(),
    ladder: optionalId
}).passthrough();

export const behaviorEmailTemplateBodySchema = z.object({
    key: z.string().trim().min(1, 'Template key is required').max(120),
    language: z.enum(['en', 'ar']),
    label: z.string().trim().max(200).optional(),
    subject: z.string().trim().min(1, 'Subject is required').max(300),
    body: z.string().trim().min(1, 'Body is required').max(20000),
    variables: z.array(z.string().trim().max(60)).max(40).optional(),
    active: z.boolean().optional()
}).passthrough();

export const behaviorSettingsPatchBodySchema = z.object({
    enabled: z.boolean().optional(),
    counting: z.object({
        mode: z.enum(BEHAVIOR_COUNTING_MODES).optional(),
        rollingDays: z.coerce.number().int().min(1).max(366).optional(),
        academicYear: z.string().trim().max(20).nullable().optional()
    }).partial().optional(),
    approval: z.object({
        defaultRequired: z.boolean().optional(),
        approverRoles: z.array(z.string().trim().max(60)).max(10).optional(),
        backupApproverRoles: z.array(z.string().trim().max(60)).max(10).optional(),
        reminderIntervalHours: z.coerce.number().min(1).max(168).optional(),
        escalationAfterHours: z.coerce.number().min(1).max(720).optional()
    }).partial().optional(),
    cc: z.object({
        roles: z.array(z.string().trim().max(60)).max(10).optional(),
        users: z.array(behaviorObjectId).max(20).optional()
    }).partial().optional(),
    sendDelayMinutes: z.coerce.number().min(0).max(240).optional(),
    sendDelayMaxMinutes: z.coerce.number().min(0).max(240).optional(),
    verifier: z.object({
        defaultRule: z.enum(BEHAVIOR_VERIFIER_RULES).optional(),
        perTaskType: z.array(z.object({
            taskType: z.enum(BEHAVIOR_TASK_TYPES),
            rule: z.enum(BEHAVIOR_VERIFIER_RULES),
            role: z.string().trim().max(60).nullable().optional()
        })).max(BEHAVIOR_TASK_TYPES.length).optional()
    }).partial().optional(),
    duplicateWindowMinutes: z.coerce.number().min(0).max(1440).optional(),
    apologyMinWords: z.coerce.number().min(0).max(2000).optional(),
    seriousIncident: z.object({
        allowedRoles: z.array(z.string().trim().max(60)).max(10).optional()
    }).partial().optional(),
    emailDelivery: z.object({
        enabled: z.boolean().optional(),
        defaultLanguage: z.enum(['en', 'ar']).optional(),
        supportedLanguages: z.array(z.enum(['en', 'ar'])).min(1).max(2).optional()
    }).partial().optional(),
    substituteAccounts: z.object({
        expiryEnabled: z.boolean().optional(),
        expiresAt: isoDate.nullable().optional()
    }).partial().optional()
}).passthrough();

export const behaviorAuditQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(500).optional()
}).passthrough();

export const behaviorReportsQuerySchema = z.object({
    from: isoDate.optional(),
    to: isoDate.optional()
}).passthrough();

export const behaviorStudentParamSchema = z.object({
    studentId: behaviorObjectId
}).passthrough();
