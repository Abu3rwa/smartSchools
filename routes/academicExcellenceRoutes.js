import express from 'express';
import { protect, authorize, resolveDepartmentScope, requirePermission } from '../middleware/auth.js';
import { requireFeature } from '../middleware/featureGate.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { parseQueryFilter } from '../middleware/queryFilter.js';
import { PERMISSIONS } from '../config/permissions.js';
import {
    getAcademicExcellenceTaskQueue,
    createAcademicExcellenceTask,
    bulkCreateAcademicExcellenceTasks,
    reviewAcademicExcellenceTask,
    generateAcademicExcellenceTask,
    createAIPracticeAssignment,
    getAIPracticePool,
    getAcademicExcellenceExclusions,
    createAcademicExcellenceExclusion,
    toggleAcademicExcellenceExclusion,
    deleteAcademicExcellenceExclusion
} from '../controllers/academicExcellenceTeacherController.js';
import {
    getAcademicExcellenceNotificationPreferences,
    updateAcademicExcellenceNotificationPreferences
} from '../controllers/academicExcellenceNotificationPrefsController.js';

const router = express.Router();

// Global middleware
router.use(protect);
router.use(requireSchoolContext);
router.use(resolveDepartmentScope);
router.use(parseQueryFilter);
router.use(requireFeature('academicIntelligence'));

// ─── Task management ────────────────────────────────────────────────
router.get(
    '/tasks/queue',
    authorize('admin', 'department_principal', 'teacher'),
    getAcademicExcellenceTaskQueue
);
router.post(
    '/tasks',
    authorize('admin', 'department_principal', 'teacher'),
    createAcademicExcellenceTask
);
router.post(
    '/tasks/bulk',
    authorize('admin', 'department_principal', 'teacher'),
    bulkCreateAcademicExcellenceTasks
);
router.patch(
    '/tasks/:taskId/review',
    authorize('admin', 'department_principal', 'teacher'),
    reviewAcademicExcellenceTask
);
router.post(
    '/tasks/generate',
    authorize('admin', 'department_principal', 'teacher'),
    generateAcademicExcellenceTask
);

router.post(
    '/ai-practice',
    authorize('admin', 'department_principal', 'teacher'),
    requirePermission(PERMISSIONS.ASSIGN_ACADEMIC_EXCELLENCE_TASKS),
    createAIPracticeAssignment
);

router.get(
    '/ai-practice/:assignmentId/pool',
    authorize('admin', 'department_principal', 'teacher', 'staff'),
    requirePermission(PERMISSIONS.ASSIGN_ACADEMIC_EXCELLENCE_TASKS),
    getAIPracticePool
);

// ─── Exclusions ─────────────────────────────────────────────────────
router.get(
    '/exclusions',
    authorize('admin', 'department_principal', 'teacher'),
    getAcademicExcellenceExclusions
);
router.post(
    '/exclusions',
    authorize('admin', 'department_principal', 'teacher'),
    createAcademicExcellenceExclusion
);
router.patch(
    '/exclusions/:exclusionId/toggle',
    authorize('admin', 'department_principal', 'teacher'),
    toggleAcademicExcellenceExclusion
);
router.delete(
    '/exclusions/:exclusionId',
    authorize('admin', 'department_principal', 'teacher'),
    deleteAcademicExcellenceExclusion
);

// ─── Notification preferences ───────────────────────────────────────
router.get(
    '/notification-preferences',
    authorize('admin', 'department_principal', 'teacher'),
    getAcademicExcellenceNotificationPreferences
);
router.put(
    '/notification-preferences',
    authorize('admin', 'department_principal', 'teacher'),
    updateAcademicExcellenceNotificationPreferences
);

export default router;
