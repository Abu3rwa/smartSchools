import express from 'express';
import {
    getAssignments,
    getAssignment,
    createAssignment,
    updateAssignment,
    deleteAssignment
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

export default router;
