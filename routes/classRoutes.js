import express from 'express';
import {
    getClasses,
    getClass,
    createClass,
    updateClass,
    deleteClass,
    addSubjectToClass,
    removeSubjectFromClass,
    getClassStats
} from '../controllers/classController.js';
import { getClassAnalytics, getClassInsights } from '../controllers/classAnaliticsController.js';
import { protect, authorize } from '../middleware/auth.js';
import { validate, validationRules } from '../middleware/validator.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// CRUD routes
router.route('/')
    .get(authorize('admin', 'teacher'), getClasses)
    .post(authorize('admin'), validationRules.createClass, validate, createClass);

// Analytics and AI insights (before /:id so they are not parsed as ids)
router.get('/:id/analytics', authorize('admin', 'teacher'), validationRules.mongoId, validate, getClassAnalytics);
router.get('/:id/insights', authorize('admin', 'teacher'), validationRules.mongoId, validate, getClassInsights);

router.route('/:id')
    .get(authorize('admin', 'teacher'), validationRules.mongoId, validate, getClass)
    .put(authorize('admin'), validationRules.mongoId, validate, updateClass)
    .delete(authorize('admin'), validationRules.mongoId, validate, deleteClass);

// Subject management
router.post('/:id/subjects', authorize('admin'), validationRules.mongoId, validate, addSubjectToClass);
router.delete('/:id/subjects/:subjectId', authorize('admin'), removeSubjectFromClass);

// Statistics
router.get('/:id/stats', authorize('admin', 'teacher'), validationRules.mongoId, validate, getClassStats);

export default router;
