import express from 'express';
import { protect, authorize, resolveDepartmentScope } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import {
    getLessonPlans,
    getLessonPlanById,
    createLessonPlan,
    updateLessonPlan,
    deleteLessonPlan,
    suggestField,
    detectStandards,
    generateSection
} from '../controllers/lessonPlanController.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
router.use(resolveDepartmentScope);

// AI routes (must be before /:id to avoid "ai" parsed as id)
router.post('/ai/suggest', authorize('teacher', 'admin'), suggestField);
router.post('/ai/detect-standards', authorize('teacher', 'admin'), detectStandards);
router.post('/ai/generate-section', authorize('teacher', 'admin'), generateSection);

router.get('/', getLessonPlans);
router.get('/:id', getLessonPlanById);
router.post('/', authorize('teacher', 'admin'), createLessonPlan);
router.put('/:id', authorize('teacher', 'admin'), updateLessonPlan);
router.delete('/:id', authorize('teacher', 'admin'), deleteLessonPlan);

export default router;
