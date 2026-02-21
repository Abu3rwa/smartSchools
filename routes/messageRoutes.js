import express from 'express';
import { body } from 'express-validator';

import { createMessageThreadController } from '../controllers/messageController.js';
import { authorize, protect } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { validate } from '../middleware/validator.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
router.use(authorize('teacher', 'admin', 'department_principal', 'staff'));

router.post(
    '/threads',
    body('subject')
        .isString()
        .trim()
        .isLength({ min: 1, max: 200 })
        .withMessage('subject is required and must be at most 200 characters'),
    body('body')
        .isString()
        .trim()
        .isLength({ min: 1, max: 5000 })
        .withMessage('body is required and must be at most 5000 characters'),
    body('recipientUserIds')
        .isArray({ min: 1 })
        .withMessage('recipientUserIds must be a non-empty array'),
    body('recipientUserIds.*')
        .isMongoId()
        .withMessage('Each recipientUserId must be a valid ID'),
    validate,
    createMessageThreadController
);

export default router;

