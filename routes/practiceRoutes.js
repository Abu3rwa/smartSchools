import express from 'express';
import {
    getMyAssignments,
    generateQuestion,
    submitAnswer,
    getPracticeHistory,
    getStudentProgress,
    getAssignmentProgress
} from '../controllers/practiceController.js';
import { protect, authorize } from '../middleware/auth.js';
import { validate, validationRules } from '../middleware/validator.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Student routes
router.get('/my-assignments', authorize('student'), getMyAssignments);
router.post('/generate', authorize('student'), generateQuestion);
router.post('/submit', authorize('student'), submitAnswer);
router.get('/history/:standardId', authorize('student'), getPracticeHistory);

// Teacher/Admin routes - view student progress
router.get('/student/:studentId/progress', authorize('admin', 'teacher'), getStudentProgress);
router.get('/assignment/:assignmentId/progress', authorize('admin', 'teacher'), getAssignmentProgress);

export default router;
