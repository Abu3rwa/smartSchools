import express from 'express';
import { getStudentAnalytics, getClassAnalytics, getSchoolAnalytics } from '../controllers/analyticsController.js';
import { protect, authorize } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);

router.get('/student/:studentId', getStudentAnalytics);
router.get('/class/:classId', authorize('teacher', 'admin', 'department_principal'), getClassAnalytics);
router.get('/school', authorize('admin'), getSchoolAnalytics);

export default router;
