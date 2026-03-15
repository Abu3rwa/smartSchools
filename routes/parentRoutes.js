import express from 'express';
import { body, param } from 'express-validator';
import {
    getParentChildLearningSummaryController,
    createParentMessageThreadController,
    getParentChildAcademicStatsController,
    getParentChildAttendanceSummaryController,
    getParentChildGradesController,
    getParentChildReportsController,
    getParentChildSubjectAcademicStatsController,
    getParentChildTimetableController,
    getParentChildrenController,
    getParentDashboardController,
    getParentMessageThreadByIdController,
    getParentMessageTeachersController,
    getParentMessageThreadsController,
    getParentSettingsController,
    getParentUpdateByIdController,
    getParentUpdatesController,
    markAllParentUpdatesAsReadController,
    markParentMessageThreadReadController,
    replyToParentMessageThreadController,
    updateParentSettingsController
} from '../controllers/parentController.js';
import { authorize, protect } from '../middleware/auth.js';
import { requireFeature } from '../middleware/featureGate.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { validate, validationRules } from '../middleware/validator.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
router.use(requireFeature('parentPortal'));
router.use(authorize('parent'));

router.get('/children', getParentChildrenController);
router.get(
    '/children/:childId/attendance-summary',
    param('childId').isMongoId().withMessage('Invalid childId format'),
    validate,
    getParentChildAttendanceSummaryController
);
router.get(
    '/children/:childId/grades',
    param('childId').isMongoId().withMessage('Invalid childId format'),
    validate,
    getParentChildGradesController
);
router.get(
    '/children/:childId/academic-stats',
    param('childId').isMongoId().withMessage('Invalid childId format'),
    validate,
    getParentChildAcademicStatsController
);
router.get(
    '/children/:childId/academic-stats/:subjectId',
    param('childId').isMongoId().withMessage('Invalid childId format'),
    param('subjectId').isMongoId().withMessage('Invalid subjectId format'),
    validate,
    getParentChildSubjectAcademicStatsController
);
router.get(
    '/children/:childId/learning-summary',
    requireFeature('academicIntelligence'),
    param('childId').isMongoId().withMessage('Invalid childId format'),
    validate,
    getParentChildLearningSummaryController
);
router.get(
    '/children/:childId/timetable',
    param('childId').isMongoId().withMessage('Invalid childId format'),
    validate,
    getParentChildTimetableController
);
router.get(
    '/children/:childId/reports',
    param('childId').isMongoId().withMessage('Invalid childId format'),
    validate,
    getParentChildReportsController
);
router.get('/dashboard', getParentDashboardController);
router.patch('/updates/read-all', markAllParentUpdatesAsReadController);
router.get('/updates', getParentUpdatesController);
router.get('/updates/:id', validationRules.mongoId, validate, getParentUpdateByIdController);
router.get('/messages/threads', validationRules.pagination, validate, getParentMessageThreadsController);
router.get('/messages/teachers', getParentMessageTeachersController);
router.post(
    '/messages/threads',
    body('teacherUserId')
        .isMongoId()
        .withMessage('teacherUserId must be a valid ID'),
    body('subject')
        .optional()
        .isString()
        .trim()
        .isLength({ min: 1, max: 200 })
        .withMessage('subject must be at most 200 characters'),
    body('body')
        .isString()
        .trim()
        .isLength({ min: 1, max: 5000 })
        .withMessage('body is required and must be at most 5000 characters'),
    validate,
    createParentMessageThreadController
);
router.get(
    '/messages/threads/:threadId',
    param('threadId').isMongoId().withMessage('Invalid threadId format'),
    validate,
    getParentMessageThreadByIdController
);
router.post(
    '/messages/threads/:threadId/replies',
    param('threadId').isMongoId().withMessage('Invalid threadId format'),
    body('body')
        .isString()
        .trim()
        .isLength({ min: 1, max: 5000 })
        .withMessage('Reply body is required and must be at most 5000 characters'),
    validate,
    replyToParentMessageThreadController
);
router.patch(
    '/messages/threads/:threadId/read',
    param('threadId').isMongoId().withMessage('Invalid threadId format'),
    validate,
    markParentMessageThreadReadController
);
router.get('/settings', getParentSettingsController);
router.patch('/settings', updateParentSettingsController);
export default router;
