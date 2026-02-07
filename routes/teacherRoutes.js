import express from 'express';
import {
    getTeachers,
    getTeacher,
    createTeacher,
    updateTeacher,
    deleteTeacher,
    assignMultipleClasses,
    removeClassAssignment,
    getMyClasses
} from '../controllers/teacherController.js';
import { protect, authorize } from '../middleware/auth.js';
import { validate, validationRules } from '../middleware/validator.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Teacher's own classes
router.get('/my-classes', authorize('teacher'), getMyClasses);

// CRUD routes
router.route('/')
    .get(getTeachers)
    .post(authorize('admin'), validationRules.createTeacher, validate, createTeacher);

router.route('/:id')
    .get(validationRules.mongoId, validate, getTeacher)
    .put(authorize('admin'), validationRules.mongoId, validate, updateTeacher)
    .delete(authorize('admin'), validationRules.mongoId, validate, deleteTeacher);

// Class assignment routes
router.post('/:id/assign-classes', authorize('admin'), validationRules.mongoId, validate, assignMultipleClasses);
router.delete('/:id/remove-class/:assignmentId', authorize('admin'), removeClassAssignment);

export default router;
