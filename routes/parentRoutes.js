import express from 'express';
import { param } from 'express-validator';
import {
    getParentChildAttendanceSummaryController,
    getParentChildGradesController,
    getParentChildReportsController,
    getParentChildTimetableController,
    getParentChildrenController,
    getParentDashboardController,
    getParentSettingsController,
    getParentUpdateByIdController,
    getParentUpdatesController,
    markAllParentUpdatesAsReadController,
    updateParentSettingsController
} from '../controllers/parentController.js';
import { authorize, protect } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { validate, validationRules } from '../middleware/validator.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
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
router.get('/settings', getParentSettingsController);
router.patch('/settings', updateParentSettingsController);

export default router;
