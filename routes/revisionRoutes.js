import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { requireFeature } from '../middleware/featureGate.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import {
  generatePlan,
  myPlans,
  getTeacherPlans,
  getPlan,
  updateProgress,
  getRecommendations,
  computeProfile
} from '../controllers/revisionPlanController.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
router.use(requireFeature('revisionPlanning'));

// Student routes
router.get('/plans', authorize('student'), myPlans);
router.patch('/plan/:planId/progress', authorize('student'), updateProgress);

// Teacher routes (with full control)
router.get('/teacher/plans', authorize('teacher', 'admin'), getTeacherPlans);
router.post('/generate-plan', authorize('student', 'teacher', 'admin'), generatePlan);
router.post('/compute-profile/:studentId', authorize('teacher', 'admin'), computeProfile);

// Shared routes
router.get('/plan/:planId', authorize('student', 'teacher', 'admin'), getPlan);
router.get('/recommendations/:studentId/:conceptId', authorize('student', 'teacher', 'admin'), getRecommendations);

export default router;
