import express from 'express';
import {
    getBehaviorOverview,
    getBehaviorRoster,
    getBehaviorEntries,
    createBehaviorEntry,
    getStudentBehaviorSummary,
    completeBehaviorFollowUp
} from '../controllers/teacherBehaviorController.js';
import { protect, authorize } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import {
    validateTeacherBehavior,
    teacherBehaviorEntryBodySchema,
    teacherBehaviorEntriesQuerySchema,
    teacherBehaviorStudentParamSchema,
    teacherBehaviorEntryParamSchema,
    teacherBehaviorFollowUpBodySchema
} from '../validators/teacherBehaviorValidators.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
router.use(authorize('teacher', 'admin', 'department_principal'));

router.get('/overview', getBehaviorOverview);
router.get('/roster', getBehaviorRoster);

router.get(
    '/entries',
    validateTeacherBehavior({ querySchema: teacherBehaviorEntriesQuerySchema }),
    getBehaviorEntries
);
router.post(
    '/entries',
    validateTeacherBehavior({ bodySchema: teacherBehaviorEntryBodySchema }),
    createBehaviorEntry
);
router.post(
    '/entries/:id/follow-up',
    validateTeacherBehavior({
        paramsSchema: teacherBehaviorEntryParamSchema,
        bodySchema: teacherBehaviorFollowUpBodySchema
    }),
    completeBehaviorFollowUp
);

router.get(
    '/students/:studentId/summary',
    validateTeacherBehavior({ paramsSchema: teacherBehaviorStudentParamSchema }),
    getStudentBehaviorSummary
);

export default router;
