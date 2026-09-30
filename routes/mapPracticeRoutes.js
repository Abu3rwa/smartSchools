import express from 'express';
import { protect, authorizeWithPermission } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { uploadMapPracticeCsv, previewMapPracticeFiles, importMapPracticeFiles, getMapPracticeImportStudents, getMapPracticeOverview, archiveMapPracticeQuestionsNotInFile, downloadMapPracticeImportErrors } from '../controllers/mapPracticeImportController.js';
import {
  getMapPracticeSettings,
  saveMapPracticeSettings,
  getStudentMapPracticePlans,
  getMyMapPracticeHome,
  createMapPracticeAssignment,
  getMapPracticeAssignmentQuestions
} from '../controllers/mapPracticeController.js';
import {
  startMapPracticeAttempt,
  saveMapPracticeAnswer,
  submitMapPracticeAttempt,
  getMapPracticeReviewQueue,
  reviewMapPracticeAttempt,
  getMapPracticeAttemptById,
  getMapPracticeReviewOptions
} from '../controllers/mapPracticeAttemptController.js';

const router = express.Router();
const requireMapPracticeAccess = asyncHandler(async (req, res, next) => {
  if (req.user?.role === 'admin') return next();
  if (req.user?.role === 'student' || req.user?.role === 'teacher') return next();
  return res.status(403).json({ success: false, message: 'Not authorized for MAP practice.' });
});

router.use(protect, requireSchoolContext, requireMapPracticeAccess);

router.get('/settings', authorizeWithPermission(['admin', 'teacher'], []), getMapPracticeSettings);
router.put('/settings', authorizeWithPermission(['admin', 'teacher'], []), saveMapPracticeSettings);
router.get('/overview', authorizeWithPermission(['admin', 'teacher'], []), getMapPracticeOverview);
router.get('/import/students', authorizeWithPermission(['admin', 'teacher'], []), getMapPracticeImportStudents);
router.post('/preview-files', authorizeWithPermission(['admin', 'teacher'], []), uploadMapPracticeCsv.array('files', 30), previewMapPracticeFiles);
router.post('/import/preview', authorizeWithPermission(['admin', 'teacher'], []), uploadMapPracticeCsv.array('files', 30), previewMapPracticeFiles);
router.post('/import-files', authorizeWithPermission(['admin', 'teacher'], []), importMapPracticeFiles);
router.post('/import/commit', authorizeWithPermission(['admin', 'teacher'], []), importMapPracticeFiles);
router.post('/import/archive-not-in-file', authorizeWithPermission(['admin', 'teacher'], []), archiveMapPracticeQuestionsNotInFile);
router.get('/import/errors/:token/:fileHash', authorizeWithPermission(['admin', 'teacher'], []), downloadMapPracticeImportErrors);
router.get('/students/:studentId/plans', authorizeWithPermission(['admin', 'teacher', 'student'], []), getStudentMapPracticePlans);
router.post('/assignments', authorizeWithPermission(['admin', 'teacher'], []), createMapPracticeAssignment);
router.get('/assignments/:assignmentId/questions', authorizeWithPermission(['student', 'admin', 'teacher'], []), getMapPracticeAssignmentQuestions);
router.get('/me/home', authorizeWithPermission(['student'], []), getMyMapPracticeHome);
router.post('/assignments/:assignmentId/start', authorizeWithPermission(['student', 'admin', 'teacher'], []), startMapPracticeAttempt);
router.post('/attempts/:attemptId/answer', authorizeWithPermission(['student', 'admin', 'teacher'], []), saveMapPracticeAnswer);
router.post('/attempts/:attemptId/submit', authorizeWithPermission(['student', 'admin', 'teacher'], []), submitMapPracticeAttempt);
router.get('/reviews/queue', authorizeWithPermission(['admin', 'teacher'], []), getMapPracticeReviewQueue);
router.get('/reviews/options', authorizeWithPermission(['student', 'admin', 'teacher'], []), getMapPracticeReviewOptions);
router.get('/attempts/:attemptId', authorizeWithPermission(['student', 'admin', 'teacher'], []), getMapPracticeAttemptById);
router.post('/attempts/:attemptId/review', authorizeWithPermission(['admin', 'teacher'], []), reviewMapPracticeAttempt);

export default router;
