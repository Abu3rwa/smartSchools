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
import {
    createGroupingWorksheetPackDraft,
    listGroupingWorksheetPacks,
    endGroupingWorksheetPackAuthoring,
    publishGroupingWorksheetPack,
    exportGroupingWorksheetPackPdf,
    printGroupingWorksheetPackPdf
} from '../controllers/studentGroupingWorksheetPackController.js';

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
    '/:classId/:standardId/worksheet-packs',
    authorize('admin', 'department_principal', 'teacher'),
    listGroupingWorksheetPacks
);

router.post(
    '/:classId/:standardId/worksheet-packs',
    authorize('admin', 'department_principal', 'teacher'),
    createGroupingWorksheetPackDraft
);

router.put(
    '/worksheet-packs/:packId/end-authoring',
    authorize('admin', 'department_principal', 'teacher'),
    endGroupingWorksheetPackAuthoring
);

router.put(
    '/worksheet-packs/:packId/publish',
    authorize('admin', 'department_principal', 'teacher'),
    publishGroupingWorksheetPack
);

router.get(
    '/worksheet-packs/:packId/export-pdf',
    authorize('admin', 'department_principal', 'teacher'),
    exportGroupingWorksheetPackPdf
);

router.get(
    '/worksheet-packs/:packId/print-pdf',
    authorize('admin', 'department_principal', 'teacher'),
    printGroupingWorksheetPackPdf
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
