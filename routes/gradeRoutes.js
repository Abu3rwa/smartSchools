import express from 'express';
import {
    addDailyGrade,
    bulkAddGrades,
    addExamGrade,
    getMyGrades,
    getStudentGrades,
    getStudentGradeReport,
    getMonthlyAverage,
    getSemesterAverage,
    getOverallAverage,
    getClassGrades,
    getGradebookGrades,
    updateGrade,
    deleteGrade,
    getClassStatistics,
    getDashboardStats
} from '../controllers/gradeController.js';
import { protect, authorize } from '../middleware/auth.js';
import { validate, validationRules } from '../middleware/validator.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Dashboard statistics
router.get('/dashboard/stats', getDashboardStats);

// Add grades
router.post('/daily', authorize('teacher', 'admin'), validationRules.createGrade, validate, addDailyGrade);
router.post('/bulk', authorize('teacher', 'admin'), bulkAddGrades);
router.post('/exam', authorize('teacher', 'admin'), addExamGrade);

// Get grades
router.get('/my-grades', authorize('student'), getMyGrades);
router.get('/student/:studentId', getStudentGrades);
router.get('/report/:studentId', getStudentGradeReport);
router.get('/class/:classId', authorize('teacher', 'admin'), getClassGrades);
router.get('/gradebook/:classId', authorize('teacher', 'admin'), getGradebookGrades);

// Averages
router.get('/average/monthly/:studentId', getMonthlyAverage);
router.get('/average/semester/:studentId', getSemesterAverage);
router.get('/average/overall/:studentId', getOverallAverage);

// Statistics
router.get('/stats/class/:classId', getClassStatistics);

// Update/Delete
router.route('/:id')
    .put(authorize('teacher', 'admin'), validationRules.mongoId, validate, updateGrade)
    .delete(authorize('teacher', 'admin'), validationRules.mongoId, validate, deleteGrade);

export default router;
