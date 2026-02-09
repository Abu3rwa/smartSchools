import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import {
    getLessonPlans,
    getLessonPlanById,
    createLessonPlan,
    updateLessonPlan,
    deleteLessonPlan
} from '../controllers/lessonPlanController.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);

router.get('/', getLessonPlans);
router.get('/:id', getLessonPlanById);
router.post('/', authorize('teacher', 'admin'), createLessonPlan);
router.put('/:id', authorize('teacher', 'admin'), updateLessonPlan);
router.delete('/:id', authorize('teacher', 'admin'), deleteLessonPlan);

export default router;
