import express from 'express';
import {
    getAssignments,
    getAssignment,
    createAssignment,
    updateAssignment,
    deleteAssignment,
    getAssignmentQuestionPool,
    updateAssignmentQuestionPool,
    reviewAssignmentQuestionPool,
    approveAssignmentQuestionPool,
    publishAssignmentQuestionPool
} from '../controllers/standardAssignmentController.js';
import { protect, authorize } from '../middleware/auth.js';
import { validate, validationRules } from '../middleware/validator.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// CRUD
router.route('/')
    .get(authorize('admin', 'teacher'), getAssignments)
    .post(authorize('admin', 'teacher'), createAssignment);

router.route('/:id')
    .get(authorize('admin', 'teacher'), validationRules.mongoId, validate, getAssignment)
    .put(authorize('admin', 'teacher'), validationRules.mongoId, validate, updateAssignment)
    .delete(authorize('admin', 'teacher'), validationRules.mongoId, validate, deleteAssignment);

router.route('/:id/question-pool')
    .get(authorize('admin', 'teacher', 'department_principal', 'staff'), validationRules.mongoId, validate, getAssignmentQuestionPool)
    .put(authorize('admin', 'teacher'), validationRules.mongoId, validate, updateAssignmentQuestionPool);

router.post('/:id/question-pool/review', authorize('admin', 'teacher'), validationRules.mongoId, validate, reviewAssignmentQuestionPool);
router.post('/:id/question-pool/approve', authorize('admin', 'department_principal', 'staff'), validationRules.mongoId, validate, approveAssignmentQuestionPool);
router.post('/:id/question-pool/publish', authorize('admin', 'department_principal', 'staff'), validationRules.mongoId, validate, publishAssignmentQuestionPool);

export default router;
