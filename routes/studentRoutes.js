import express from 'express';
import {
    getStudents,
    getStudent,
    createStudent,
    updateStudent,
    deleteStudent,
    getStudentsByClass,
    bulkEnrollStudents,
    importStudents,
    transferStudent,
    createStudentLogin,
    bulkCreateStudentLogin,
    resetStudentPassword
} from '../controllers/studentController.js';
import { protect, authorize } from '../middleware/auth.js';
import { validate, validationRules } from '../middleware/validator.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// CRUD routes
router.route('/')
    .get(authorize('admin', 'teacher'), getStudents)
    .post(authorize('admin'), validationRules.createStudent, validate, createStudent);

// Additional routes (before /:id to avoid param conflicts)
router.post('/import', authorize('admin'), importStudents);
router.post('/bulk-create-login', authorize('admin'), bulkCreateStudentLogin);
router.get('/class/:classId', authorize('admin', 'teacher'), getStudentsByClass);

router.route('/:id')
    .get(authorize('admin', 'teacher'), validationRules.mongoId, validate, getStudent)
    .put(authorize('admin'), validationRules.mongoId, validate, updateStudent)
    .delete(authorize('admin'), validationRules.mongoId, validate, deleteStudent);
router.post('/bulk-enroll', authorize('admin'), bulkEnrollStudents);
router.post('/:id/create-login', authorize('admin'), createStudentLogin);
router.post('/:id/reset-password', authorize('admin'), resetStudentPassword);
router.put('/:id/transfer', authorize('admin'), validationRules.mongoId, validate, transferStudent);

export default router;
