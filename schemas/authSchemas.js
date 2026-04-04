import { z } from 'zod';

/**
 * BE-015: Zod schemas for authentication endpoints.
 * Applied via validateRequestSchema middleware on auth routes.
 */

export const loginBodySchema = z.object({
    email: z.string().email('Valid email is required').max(254),
    password: z.string().min(1, 'Password is required').max(128),
});

export const registerBodySchema = z.object({
    firstName: z.string().min(1).max(100).trim(),
    lastName: z.string().min(1).max(100).trim(),
    email: z.string().email().max(254),
    password: z.string().min(8, 'Password must be at least 8 characters').max(128),
    role: z.enum(['admin', 'teacher']).optional(),
});

export const forgotPasswordBodySchema = z.object({
    email: z.string().email('Valid email is required').max(254),
});

export const resetPasswordBodySchema = z.object({
    password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

export const resetPasswordParamsSchema = z.object({
    token: z.string().min(10).max(256),
});

export const changePasswordBodySchema = z.object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(8, 'New password must be at least 8 characters').max(128),
});

export const gradeCreateBodySchema = z.object({
    student: z.string().min(1, 'Student ID is required'),
    subject: z.string().min(1, 'Subject ID is required'),
    marks: z.number().min(0, 'Marks cannot be negative'),
    maxMarks: z.number().min(1, 'Max marks must be at least 1'),
    gradeType: z.string().min(1).optional(),
    date: z.string().or(z.date()).optional(),
    description: z.string().max(1000).optional(),
}).refine(data => {
    if (data.marks !== undefined && data.maxMarks !== undefined) {
        return data.marks <= data.maxMarks;
    }
    return true;
}, { message: 'Marks cannot exceed maxMarks' });
