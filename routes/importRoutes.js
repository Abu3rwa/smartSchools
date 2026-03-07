import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import {
    previewImport,
    commitImport,
    listImportRuns,
    downloadImportErrorReport
} from '../controllers/importController.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
router.use(authorize('admin', 'department_principal'));

router.get('/runs', listImportRuns);
router.get('/runs/:id/error-report', downloadImportErrorReport);
router.post('/:entityType/preview', previewImport);
router.post('/:entityType/commit', commitImport);

export default router;
