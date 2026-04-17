import express from 'express';
import {
    generateCommunicationEmailDraftController,
    getCommunicationComposerConfigController,
    getCommunicationEmailHistoryController,
    getCommunicationRecipientSuggestionsController,
    previewCommunicationEmailRecipientsController,
    sendCommunicationEmailController
} from '../controllers/communicationEmailController.js';
import {
    downloadCommunicationEmailAttachmentController,
    removeCommunicationEmailAttachmentController,
    uploadCommunicationEmailAttachmentsController
} from '../controllers/communicationEmailAttachmentController.js';
import { authorizeWithPermission, protect, resolveDepartmentScope } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { PERMISSIONS } from '../config/permissions.js';
import { uploadCommunicationEmailAttachments } from '../middleware/uploadCommunicationEmailAttachments.js';
import { validateRequestSchema } from '../middleware/schemaValidator.js';
import { aiFeatureRateLimiter, emailSendRateLimiter } from '../middleware/rateLimiters.js';
import {
    communicationEmailAttachmentParamsSchema,
    communicationEmailDraftBodySchema,
    communicationEmailHistoryQuerySchema,
    communicationEmailPreviewBodySchema,
    communicationEmailSendBodySchema,
    communicationEmailSuggestionsQuerySchema
} from '../validators/communicationEmailValidators.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
router.use(resolveDepartmentScope);
router.use(authorizeWithPermission(
    ['admin', 'teacher', 'department_principal', 'staff'],
    [PERMISSIONS.SEND_COMMUNICATION_EMAILS, PERMISSIONS.SEND_NOTIFICATIONS]
));

const uploadCommunicationEmailAttachmentsMiddleware = (req, res, next) => {
    uploadCommunicationEmailAttachments(req, res, (error) => {
        if (!error) {
            return next();
        }
        error.statusCode = 400;
        return next(error);
    });
};

router.get('/composer-config', getCommunicationComposerConfigController);

router.get(
    '/suggestions',
    validateRequestSchema({ querySchema: communicationEmailSuggestionsQuerySchema }),
    getCommunicationRecipientSuggestionsController
);

router.post(
    '/preview',
    validateRequestSchema({ bodySchema: communicationEmailPreviewBodySchema }),
    previewCommunicationEmailRecipientsController
);

router.post(
    '/attachments',
    uploadCommunicationEmailAttachmentsMiddleware,
    uploadCommunicationEmailAttachmentsController
);

router.delete(
    '/attachments/:attachmentId',
    validateRequestSchema({ paramsSchema: communicationEmailAttachmentParamsSchema }),
    removeCommunicationEmailAttachmentController
);

router.get(
    '/attachments/:attachmentId/download',
    validateRequestSchema({ paramsSchema: communicationEmailAttachmentParamsSchema }),
    downloadCommunicationEmailAttachmentController
);

router.post(
    '/ai-draft',
    aiFeatureRateLimiter,
    validateRequestSchema({ bodySchema: communicationEmailDraftBodySchema }),
    generateCommunicationEmailDraftController
);

router.post(
    '/send',
    emailSendRateLimiter,
    validateRequestSchema({ bodySchema: communicationEmailSendBodySchema }),
    sendCommunicationEmailController
);

router.get(
    '/history',
    validateRequestSchema({ querySchema: communicationEmailHistoryQuerySchema }),
    getCommunicationEmailHistoryController
);

export default router;
