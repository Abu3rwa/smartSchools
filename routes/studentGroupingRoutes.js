import express from 'express';
import { protect, authorize, resolveDepartmentScope } from '../middleware/auth.js';
import { requireFeature } from '../middleware/featureGate.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import {
    getStudentGroups,
    saveGroupingOverride,
    getGroupingOverview,
    refreshGroupActivities,
    exportStudentGroupingPdf,
    exportGroupingOverviewPdf,
    getGroupingReports,
    downloadGroupingReport
} from '../controllers/studentGroupingController.js';

const router = express.Router();

// Global middleware
router.use(protect);
router.use(requireSchoolContext);
router.use(resolveDepartmentScope);
router.use(requireFeature('academicIntelligence'));

// ─── Grouping endpoints ──────────────────────────────────────────────
router.get(
    '/:classId/overview',
    authorize('admin', 'department_principal', 'teacher'),
    getGroupingOverview
);

router.get(
    '/:classId/export-overview-pdf',
    authorize('admin', 'department_principal', 'teacher'),
    exportGroupingOverviewPdf
);

router.get(
    '/:classId/reports',
    authorize('admin', 'department_principal', 'teacher'),
    getGroupingReports
);

router.get(
    '/reports/:reportId/download',
    authorize('admin', 'department_principal', 'teacher'),
    downloadGroupingReport
);

router.get(
    '/:classId/:standardId',
    authorize('admin', 'department_principal', 'teacher'),
    getStudentGroups
);

router.get(
    '/:classId/:standardId/export-pdf',
    authorize('admin', 'department_principal', 'teacher'),
    exportStudentGroupingPdf
);

router.put(
    '/:classId/:standardId/override',
    authorize('admin', 'department_principal', 'teacher'),
    saveGroupingOverride
);

router.post(
    '/:classId/:standardId/refresh-activities',
    authorize('admin', 'department_principal', 'teacher'),
    refreshGroupActivities
);

export default router;
