import express from 'express';

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
import { validateRequestSchema } from '../middleware/schemaValidator.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import {
    messageClassesQuerySchema,
    messageParentsQuerySchema,
    messageReplyBodySchema,
    messageThreadCreateBodySchema,
    messageThreadsQuerySchema
} from '../validators/messageValidators.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
router.use(authorize('teacher', 'admin', 'department_principal', 'staff'));

router.post(
    '/threads',
    validateRequestSchema({ bodySchema: messageThreadCreateBodySchema }),
    createMessageThreadController
);

router.get(
    '/threads',
    validateRequestSchema({ querySchema: messageThreadsQuerySchema }),
    getMessageThreadsController
);

router.get('/threads/:threadId', getMessageThreadByIdController);

router.post(
    '/threads/:threadId/replies',
    validateRequestSchema({ bodySchema: messageReplyBodySchema }),
    replyToMessageThreadController
);

router.patch('/threads/:threadId/read', markMessageThreadReadController);

router.get(
    '/classes',
    validateRequestSchema({ querySchema: messageClassesQuerySchema }),
    getMessageClassesForMessagingController
);

router.get(
    '/parents',
    validateRequestSchema({ querySchema: messageParentsQuerySchema }),
    getParentUsersForMessagingController
);

export default router;
