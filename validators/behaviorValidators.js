import { body, param, query } from 'express-validator';

const periods = ['day', 'week', 'month', 'quarter', 'year'];

export const behaviorValidationRules = {
    trackEvent: [
        body('eventType')
            .isString()
            .trim()
            .notEmpty()
            .withMessage('eventType is required'),
        body('action')
            .isString()
            .trim()
            .isLength({ min: 2, max: 100 })
            .withMessage('action must be between 2 and 100 characters'),
        body('description')
            .optional()
            .isString()
            .trim()
            .isLength({ max: 500 })
            .withMessage('description must be at most 500 characters'),
        body('resourceType')
            .optional()
            .isString()
            .trim(),
        body('resourceId')
            .optional()
            .isMongoId()
            .withMessage('resourceId must be a valid Mongo ID'),
        body('metadata')
            .optional()
            .isObject()
            .withMessage('metadata must be an object')
    ],
    listEvents: [
        query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
        query('limit').optional().isInt({ min: 1, max: 200 }).withMessage('limit must be between 1 and 200'),
        query('school').optional().isMongoId().withMessage('school must be a valid Mongo ID'),
        query('user').optional().isMongoId().withMessage('user must be a valid Mongo ID'),
        query('period').optional().isIn(periods).withMessage(`period must be one of: ${periods.join(', ')}`)
    ],
    sessionStart: [
        body('metadata').optional().isObject().withMessage('metadata must be an object')
    ],
    sessionIdParam: [
        param('sessionId').isString().trim().notEmpty().withMessage('sessionId is required')
    ],
    dashboardQuery: [
        query('period').optional().isIn(periods).withMessage(`period must be one of: ${periods.join(', ')}`),
        query('school').optional().isMongoId().withMessage('school must be a valid Mongo ID'),
        query('eventType').optional().isString().trim().isLength({ max: 80 }).withMessage('eventType must be at most 80 characters')
    ]
};
