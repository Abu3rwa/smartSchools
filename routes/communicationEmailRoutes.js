import express from 'express';
import { body, param, query } from 'express-validator';
import {
    generateCommunicationEmailDraftController,
    downloadCommunicationEmailAttachmentController,
    getCommunicationComposerConfigController,
    getCommunicationEmailHistoryController,
    getCommunicationRecipientSuggestionsController,
    previewCommunicationEmailRecipientsController,
    removeCommunicationEmailAttachmentController,
    sendCommunicationEmailController,
    uploadCommunicationEmailAttachmentsController
} from '../controllers/communicationEmailController.js';
import { authorizeWithPermission, protect, resolveDepartmentScope } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { validate } from '../middleware/validator.js';
import { PERMISSIONS } from '../config/permissions.js';
import { uploadCommunicationEmailAttachments } from '../middleware/uploadCommunicationEmailAttachments.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
router.use(resolveDepartmentScope);
router.use(authorizeWithPermission(
    ['admin', 'teacher', 'department_principal', 'staff'],
    [PERMISSIONS.SEND_COMMUNICATION_EMAILS, PERMISSIONS.SEND_NOTIFICATIONS]
));

router.get('/composer-config', getCommunicationComposerConfigController);

router.get(
    '/suggestions',
    query('field')
        .isIn(['parents', 'teachers', 'students'])
        .withMessage('field must be one of: parents, teachers, students'),
    query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100'),
    validate,
    getCommunicationRecipientSuggestionsController
);

router.post(
    '/preview',
    body('toParents').optional().isArray().withMessage('toParents must be an array'),
    body('toTeachers').optional().isArray().withMessage('toTeachers must be an array'),
    body('toStudents').optional().isArray().withMessage('toStudents must be an array'),
    validate,
    previewCommunicationEmailRecipientsController
);

router.post(
    '/attachments',
    (req, res, next) => {
        uploadCommunicationEmailAttachments(req, res, (error) => {
            if (error) {
                return res.status(400).json({
                    success: false,
                    message: error.message || 'Attachment upload failed'
                });
            }
            return next();
        });
    },
    uploadCommunicationEmailAttachmentsController
);

router.delete(
    '/attachments/:attachmentId',
    param('attachmentId').isMongoId().withMessage('Invalid attachment id'),
    validate,
    removeCommunicationEmailAttachmentController
);
router.get(
    '/attachments/:attachmentId/download',
    param('attachmentId').isMongoId().withMessage('Invalid attachment id'),
    validate,
    downloadCommunicationEmailAttachmentController
);

router.post(
    '/ai-draft',
    body('prompt')
        .isString()
        .trim()
        .isLength({ min: 1, max: 2000 })
        .withMessage('prompt is required and must be at most 2000 characters'),
    body('tone')
        .optional()
        .isIn(['professional', 'formal', 'warm', 'concise', 'friendly'])
        .withMessage('tone must be one of: professional, formal, warm, concise, friendly'),
    body('toParents').optional().isArray().withMessage('toParents must be an array'),
    body('toTeachers').optional().isArray().withMessage('toTeachers must be an array'),
    body('toStudents').optional().isArray().withMessage('toStudents must be an array'),
    validate,
    generateCommunicationEmailDraftController
);

router.post(
    '/send',
    body('subject')
        .isString()
        .trim()
        .isLength({ min: 1, max: 220 })
        .withMessage('subject is required and must be at most 220 characters'),
    body('bodyHtml')
        .optional()
        .isString()
        .withMessage('bodyHtml must be a string'),
    body('body')
        .optional()
        .isString()
        .withMessage('body must be a string'),
    body('toParents').optional().isArray().withMessage('toParents must be an array'),
    body('toTeachers').optional().isArray().withMessage('toTeachers must be an array'),
    body('toStudents').optional().isArray().withMessage('toStudents must be an array'),
    body('attachmentIds').optional().isArray().withMessage('attachmentIds must be an array'),
    body('attachmentIds.*').optional().isMongoId().withMessage('Each attachmentId must be a valid ID'),
    body('scheduledForLocal')
        .optional()
        .isString()
        .isLength({ min: 1, max: 25 })
        .withMessage('scheduledForLocal must be a valid local datetime string'),
    body('clientTimeZone')
        .optional()
        .isString()
        .isLength({ min: 1, max: 100 })
        .withMessage('clientTimeZone must be a valid IANA timezone string'),
    validate,
    sendCommunicationEmailController
);

router.get(
    '/history',
    query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100'),
    validate,
    getCommunicationEmailHistoryController
);

export default router;
