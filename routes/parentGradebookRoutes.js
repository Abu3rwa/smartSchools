import express from 'express';
import { getParentGrades, getParentProgress, getParentReportCards } from '../controllers/parentGradebookController.js';
import { protect, authorize } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);

// All endpoints accessible by parent role + admin for testing
router.get('/grades/:studentId', authorize('parent', 'admin'), getParentGrades);
router.get('/progress/:studentId', authorize('parent', 'admin'), getParentProgress);
router.get('/report-cards/:studentId', authorize('parent', 'admin'), getParentReportCards);

export default router;
