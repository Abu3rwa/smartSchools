import express from 'express';
import { previewExport, downloadExport } from '../controllers/exportProfileController.js';
import { protect, authorize } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
router.use(authorize('teacher', 'admin', 'department_principal'));

router.post('/preview', previewExport);
router.post('/xlsx', downloadExport);

export default router;
