import { body, param, query } from 'express-validator';

export const getCandidatesRules = [
    body('absentTeacherId').isMongoId().withMessage('Valid absentTeacherId is required'),
    body('date').isISO8601().withMessage('Valid date (YYYY-MM-DD) is required')
];

export const createRequestRules = [
    body('absentTeacherId').isMongoId().withMessage('Valid absentTeacherId is required'),
    body('date').isISO8601().withMessage('Valid date is required'),
    body('coverageType')
        .isIn(['SINGLE_TEACHER_ALL_PERIODS', 'PER_PERIOD'])
        .withMessage('coverageType must be SINGLE_TEACHER_ALL_PERIODS or PER_PERIOD'),
    body('periods').optional().isArray().withMessage('periods must be an array'),
    body('periods.*.periodId').optional().isMongoId(),
    body('periods.*').optional().isMongoId(),
    body('selections').notEmpty().withMessage('selections is required'),
    body('principalNote').optional().trim().isString(),
    body('materialsLink').optional().trim().isString(),
    body('expiresInHours').optional().isFloat({ min: 1, max: 168 }).withMessage('expiresInHours must be 1-168')
];

export const listRequestsRules = [
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
    query('status').optional().isIn(['SUBMITTED', 'CONFIRMED', 'DECLINED', 'CANCELLED', 'EXPIRED']),
    query('absentTeacherId').optional().isMongoId(),
    query('substituteTeacherId').optional().isMongoId(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 })
];

export const respondRules = [
    body('token').notEmpty().trim().withMessage('Token is required'),
    body('action').isIn(['CONFIRM', 'DECLINE']).withMessage('action must be CONFIRM or DECLINE'),
    body('note').optional().trim().isString()
];

export const cancelRules = [
    body('note').optional().trim().isString()
];

export const mongoIdParam = [param('id').isMongoId().withMessage('Invalid ID format')];

export const createAbsenceRules = [
    body('teacherId').isMongoId().withMessage('Valid teacherId is required'),
    body('date').isISO8601().withMessage('Valid date is required'),
    body('reason').optional().trim().isString()
];
