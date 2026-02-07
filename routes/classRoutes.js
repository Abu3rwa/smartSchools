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
import { protect, authorize } from '../middleware/auth.js';
import { validate, validationRules } from '../middleware/validator.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// CRUD routes
router.route('/')
    .get(getClasses)
    .post(authorize('admin'), validationRules.createClass, validate, createClass);

router.route('/:id')
    .get(validationRules.mongoId, validate, getClass)
    .put(authorize('admin'), validationRules.mongoId, validate, updateClass)
    .delete(authorize('admin'), validationRules.mongoId, validate, deleteClass);

// Subject management
router.post('/:id/subjects', authorize('admin'), validationRules.mongoId, validate, addSubjectToClass);
router.delete('/:id/subjects/:subjectId', authorize('admin'), removeSubjectFromClass);

// Statistics
router.get('/:id/stats', validationRules.mongoId, validate, getClassStats);

export default router;
