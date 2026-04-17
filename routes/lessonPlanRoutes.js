import express from 'express';
import { protect, authorize, authorizeWithPermission, resolveDepartmentScope } from '../middleware/auth.js';
import { requireFeature } from '../middleware/featureGate.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { PERMISSIONS } from '../config/permissions.js';
import { uploadLessonPlanContext } from '../middleware/uploadLessonPlanContext.js';
import { aiFeatureRateLimiter } from '../middleware/rateLimiters.js';
import {
    getLessonPlans,
    getLessonPlanById,
    createLessonPlan,
    updateLessonPlan,
    deleteLessonPlan,
    suggestField,
    detectStandards,
    generateSection,
    extractPdf,
    submitLessonPlan,
    getLessonPlansForReview,
    reviewLessonPlan,
    getLessonPlanStats,
    setAdminNoteToLessonPlan
} from '../controllers/lessonPlanController.js';
import {
    triggerEvaluation,
    getEvaluationHistory
} from '../controllers/evaluationController.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
router.use(resolveDepartmentScope);

// AI routes (must be before /:id to avoid "ai" parsed as id)
router.post('/ai/suggest', authorize('teacher', 'admin'), aiFeatureRateLimiter, suggestField);
router.post('/ai/detect-standards', authorize('teacher', 'admin'), aiFeatureRateLimiter, detectStandards);
router.post('/ai/generate-section', authorize('teacher', 'admin'), aiFeatureRateLimiter, generateSection);
router.post('/ai/extract-pdf', authorize('teacher', 'admin'), aiFeatureRateLimiter, uploadLessonPlanContext, extractPdf);

// Admin review routes (must be before /:id)
router.get('/admin/review', authorizeWithPermission(
    ['admin', 'department_principal'],
    [PERMISSIONS.REVIEW_LESSON_PLANS]
), getLessonPlansForReview);

router.get('/stats', authorizeWithPermission(
    ['admin', 'department_principal'],
    [PERMISSIONS.REVIEW_LESSON_PLANS]
), getLessonPlanStats);

// View routes - allow teachers, admins, principals, and users with review permission
router.get('/', authorizeWithPermission(
    ['teacher', 'admin', 'department_principal'],
    [PERMISSIONS.REVIEW_LESSON_PLANS]
), getLessonPlans);

router.get('/:id', authorizeWithPermission(
    ['teacher', 'admin', 'department_principal'],
    [PERMISSIONS.REVIEW_LESSON_PLANS]
), getLessonPlanById);

// Edit routes - only teachers and admins
router.post('/', authorize('teacher', 'admin'), uploadLessonPlanContext, createLessonPlan);
router.put('/:id', authorize('teacher', 'admin'), uploadLessonPlanContext, updateLessonPlan);
router.delete('/:id', authorize('teacher', 'admin'), deleteLessonPlan);

// Submission and review routes
router.post('/:id/submit', authorize('teacher', 'admin'), submitLessonPlan);
router.post('/:id/evaluation/trigger', authorizeWithPermission(
    ['admin', 'department_principal'],
    [PERMISSIONS.REVIEW_LESSON_PLANS]
), requireFeature('aiLessonPlanEvaluation'), triggerEvaluation);
router.get('/:id/evaluation/history', authorizeWithPermission(
    ['admin', 'department_principal'],
    [PERMISSIONS.REVIEW_LESSON_PLANS]
), requireFeature('aiLessonPlanEvaluation'), getEvaluationHistory);
router.post('/:id/review', authorizeWithPermission(
    ['admin', 'department_principal'],
    [PERMISSIONS.REVIEW_LESSON_PLANS]
), reviewLessonPlan);
router.put('/:id/admin-note', authorizeWithPermission(
    ['admin', 'department_principal'],
    [PERMISSIONS.REVIEW_LESSON_PLANS]
), setAdminNoteToLessonPlan);

export default router;
