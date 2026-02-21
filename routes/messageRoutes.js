import express from 'express';
import { body } from 'express-validator';

import {
    createMessageThreadController,
    getMessageThreadsController,
    getMessageThreadByIdController,
    replyToMessageThreadController,
    markMessageThreadReadController,
    getParentUsersForMessagingController,
    getMessageClassesForMessagingController
} from '../controllers/messageController.js';
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
        .optional()
        .isArray()
        .withMessage('recipientUserIds must be an array'),
    body('recipientUserIds.*')
        .optional()
        .isMongoId()
        .withMessage('Each recipientUserId must be a valid ID'),
    body('classIds')
        .optional()
        .isArray()
        .withMessage('classIds must be an array'),
    body('classIds.*')
        .optional()
        .isMongoId()
        .withMessage('Each classId must be a valid ID'),
    body('includeParents')
        .optional()
        .isBoolean()
        .withMessage('includeParents must be a boolean'),
    body('includeStudents')
        .optional()
        .isBoolean()
        .withMessage('includeStudents must be a boolean'),
    validate,
    createMessageThreadController
);

router.get('/threads', getMessageThreadsController);

router.get('/threads/:threadId', getMessageThreadByIdController);

router.post(
    '/threads/:threadId/replies',
    body('body')
        .isString()
        .trim()
        .isLength({ min: 1, max: 5000 })
        .withMessage('body is required and must be at most 5000 characters'),
    validate,
    replyToMessageThreadController
);

router.patch('/threads/:threadId/read', markMessageThreadReadController);

router.get('/classes', getMessageClassesForMessagingController);

router.get('/parents', getParentUsersForMessagingController);

export default router;
