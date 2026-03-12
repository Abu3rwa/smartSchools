import { z } from 'zod';

const OBJECT_ID_PATTERN = /^[a-fA-F0-9]{24}$/;
const objectIdSchema = z.string().regex(OBJECT_ID_PATTERN, 'Invalid id');

const messageThreadCreateAudienceSchema = z.object({
    recipientUserIds: z.array(objectIdSchema).optional(),
    classIds: z.array(objectIdSchema).optional(),
    includeParents: z.boolean().optional(),
    includeStudents: z.boolean().optional()
}).passthrough();

export const messageThreadCreateBodySchema = z.object({
    subject: z.string().trim().min(1, 'subject is required').max(200, 'subject is required and must be at most 200 characters'),
    body: z.string().trim().min(1, 'body is required').max(5000, 'body is required and must be at most 5000 characters')
}).merge(messageThreadCreateAudienceSchema).passthrough();

export const messageReplyBodySchema = z.object({
    body: z.string().trim().min(1, 'body is required').max(5000, 'body is required and must be at most 5000 characters')
}).passthrough();

export const messageThreadsQuerySchema = z.object({
    page: z.coerce.number().int().min(1, 'page must be a positive integer').optional(),
    limit: z.coerce.number().int().min(1).max(100, 'limit must be between 1 and 100').optional(),
    unreadOnly: z.union([z.boolean(), z.string()]).optional()
}).passthrough();

export const messageClassesQuerySchema = z.object({
    search: z.string().trim().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(500, 'limit must be between 1 and 500').optional()
}).passthrough();

export const messageParentsQuerySchema = z.object({
    search: z.string().trim().max(200).optional(),
    page: z.coerce.number().int().min(1, 'page must be a positive integer').optional(),
    limit: z.coerce.number().int().min(1).max(100, 'limit must be between 1 and 100').optional()
}).passthrough();
