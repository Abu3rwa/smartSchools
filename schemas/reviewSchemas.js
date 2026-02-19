import { z } from 'zod';

export const completeReviewTaskBodySchema = z.object({
  accuracyAtCompletion: z.number().min(0).max(100),
  attemptCount: z.number().int().min(0).default(1),
});

export const reviewQueueQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const interventionQueueQuerySchema = z.object({
  classId: z.string().optional(),
  subjectId: z.string().optional(),
  riskLevel: z.enum(['low', 'medium', 'high']).optional(),
  status: z.enum(['open', 'acknowledged', 'in_progress', 'resolved', 'dismissed']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const interventionActionBodySchema = z.object({
  note: z.string().trim().max(1000).optional(),
});
