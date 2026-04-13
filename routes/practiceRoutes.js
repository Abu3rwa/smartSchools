import express from 'express';
import {
    getMyAssignments,
    generateQuestion,
    submitAnswer,
    getPracticeHistory,
    getStudentProgress,
    getAssignmentProgress,
    finalizeAssessment,
    getMyAssessmentResults,
    getAssessmentGradebook,
    getStandardAverageGradebook,
    getSBGradebook,
    getSBGradebookMatrix,
    updateManualScore,
    updateBulkManualScores,
    releaseAssessmentResults,
    logIntegrityEvent,
    getIntegrityByAssignment,
    getIntegrityByStudent,
    overrideAttemptGrading,
    getStudentAssessmentAttempts
} from '../controllers/standardsPracticeController.js';
import { protect, authorize } from '../middleware/auth.js';
import { requireFeature } from '../middleware/featureGate.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { validate, validationRules } from '../middleware/validator.js';

const router = express.Router();

// All routes require authentication
router.use(protect);
router.use(requireSchoolContext);
router.use(requireFeature('standardsPractice'));

// Student routes
router.get('/my-assignments', authorize('student'), getMyAssignments);
router.post('/generate', authorize('student'), generateQuestion);
router.post('/submit', authorize('student'), submitAnswer);
router.post('/assessment/finalize', authorize('student'), finalizeAssessment);
router.get('/assessment/my-results', authorize('student'), getMyAssessmentResults);
router.get('/history/:standardId', authorize('student'), getPracticeHistory);
router.post('/integrity-event', authorize('student'), logIntegrityEvent);

// Teacher/Admin routes - view student progress
router.get('/student/:studentId/progress', authorize('admin', 'teacher'), getStudentProgress);
router.get('/assignment/:assignmentId/progress', authorize('admin', 'teacher'), getAssignmentProgress);
router.get('/assessment/:assignmentId/gradebook', authorize('admin', 'teacher'), getAssessmentGradebook);
router.get('/assessment/standard-average', authorize('admin', 'teacher'), getStandardAverageGradebook);
router.get('/sb-gradebook', authorize('admin', 'teacher', 'department_principal'), getSBGradebook);
router.get('/sb-gradebook/matrix', authorize('admin', 'teacher', 'department_principal'), getSBGradebookMatrix);
router.put('/sb-gradebook/manual-score', authorize('admin', 'teacher'), updateManualScore);
router.put('/sb-gradebook/manual-scores/bulk', authorize('admin', 'teacher'), updateBulkManualScores);
router.put('/attempts/:attemptId/override', authorize('admin', 'teacher', 'department_principal'), overrideAttemptGrading);
router.get('/attempts/student/:studentId/assessment/:assignmentId', authorize('admin', 'teacher', 'department_principal'), getStudentAssessmentAttempts);
router.post('/assessment/:assignmentId/release', authorize('admin', 'teacher'), releaseAssessmentResults);
router.get('/integrity/assignment/:assignmentId', authorize('admin', 'teacher'), getIntegrityByAssignment);
router.get('/integrity/student/:studentId', authorize('admin', 'teacher'), getIntegrityByStudent);

export default router;
