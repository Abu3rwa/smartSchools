import { z } from 'zod';

export const QUESTION_TYPES = ['multiple_choice', 'short_answer', 'true_false'];
export const DIFFICULTIES = ['easy', 'medium', 'hard'];
export const SESSION_TYPES = ['assessment', 'homework', 'classwork', 'practice'];

export const practiceConfigSchema = z.object({
    sessionType: z.enum(SESSION_TYPES).optional(),
    questionLimit: z.number().int().min(1).max(200).nullable().optional(),
    timeLimitSeconds: z.number().int().min(60).max(6 * 60 * 60).nullable().optional(),
    allowedQuestionTypes: z.array(z.enum(QUESTION_TYPES)).min(1).optional(),
    allowedDifficulties: z.array(z.enum(DIFFICULTIES)).min(1).optional(),
    availability: z.object({
        startAt: z.coerce.date().nullable().optional(),
        endAt: z.coerce.date().nullable().optional()
    }).optional(),
    lockStudentOptions: z.boolean().optional()
}).strict();

export const masterySchema = z.object({
    isMastered: z.boolean(),
    totalAttempts: z.number(),
    correctCount: z.number(),
    percentage: z.number(),
    needsMore: z.number().optional(),
    // Extended adaptive mastery
    lifetimeStats: z.object({
        totalAttempts: z.number(),
        correctCount: z.number(),
        percentage: z.number()
    }).optional(),
    rollingWindowStats: z.object({
        windowAttempts: z.number(),
        windowCorrect: z.number(),
        percentage: z.number(),
        weightedPercentage: z.number(),
        currentStreak: z.number(),
        bestStreak: z.number().optional(),
        meetsStreak: z.boolean()
    }).optional(),
    masteryStatus: z.enum(['not_started', 'in_progress', 'mastered', 'needs_review']).optional(),
    masteredAt: z.coerce.date().nullable().optional(),
    needsReview: z.boolean().optional(),
    confidenceScore: z.number().optional()
}).passthrough();

export const sessionSchema = z.object({
    id: z.string(),
    sessionType: z.enum(SESSION_TYPES),
    questionLimit: z.number().nullable(),
    timeLimitSeconds: z.number().nullable(),
    timeRemainingSeconds: z.number().nullable(),
    status: z.enum(['active', 'completed', 'expired']),
    questionsAnswered: z.number(),
    correctCount: z.number()
});

export const feedbackPartsSchema = z.object({
    headline: z.string().optional(),
    personalGreeting: z.string().optional(),
    whatYouDidWell: z.string().optional(),
    correctionOrConfirmation: z.string().optional(),
    nextStep: z.string().optional(),
    encouragement: z.string().optional(),
    displayAnswer: z.string().optional(),
    explanation: z.string().optional(),
    reviewTag: z.string().optional(),
    confidenceLevel: z.enum(['low', 'medium', 'high']).optional(),
    reasonSummary: z.string().optional(),
    conceptChecks: z.object({
        matched: z.array(z.string()).optional(),
        missing: z.array(z.string()).optional()
    }).optional()
});

export const generateQuestionResponseSchema = z.object({
    status: z.enum(['mastered', 'question', 'session_complete']),
    message: z.string().nullable().optional(),
    studentFirstName: z.string().nullable().optional(),
    mastery: masterySchema.optional(),
    suggestRemediation: z.boolean().optional(),
    question: z.object({
        attemptId: z.string(),
        questionText: z.string(),
        questionType: z.enum(QUESTION_TYPES),
        options: z.array(z.object({
            label: z.string(),
            text: z.string()
        })).optional(),
        difficulty: z.enum(DIFFICULTIES),
        attemptNumber: z.number()
    }).nullable(),
    session: sessionSchema.nullable().optional()
});

export const submitAnswerResponseSchema = z.object({
    isCorrect: z.boolean(),
    correctAnswer: z.string(),
    correctAnswerDisplay: z.string().nullable().optional(),
    explanation: z.string().nullable().optional(),
    feedback: z.string().nullable().optional(),
    feedbackParts: feedbackPartsSchema.nullable().optional(),
    studentFirstName: z.string().nullable().optional(),
    mastery: masterySchema.optional(),
    newlyMastered: z.boolean().optional(),
    sessionComplete: z.boolean().optional(),
    session: sessionSchema.nullable().optional()
});

export const integrityEventSchema = z.object({
    assignmentId: z.string(),
    attemptId: z.string().nullable().optional(),
    eventType: z.enum(['tab_hidden', 'window_blur', 'visibility_visible', 'window_focus']),
    metadata: z.record(z.string(), z.any()).optional()
});
