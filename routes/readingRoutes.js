import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import {
  uploadText,
  getTexts,
  getTextById,
  getSimplifiedForCurrentStudent,
  getSimplified,
  assessLevel,
  getStudentLevel,
  updateProgress,
  evaluateCriticalThinkingAnswer,
  createAssignment,
  myAssignments,
  getTeacherAssignments,
} from '../controllers/readingController.js';

const router = express.Router();

router.use(protect);

// Teacher/Admin: upload and manage texts
router.post('/upload-text', authorize('teacher', 'admin'), uploadText);
router.get('/texts', authorize('teacher', 'admin'), getTexts);
router.get('/texts/:textId', authorize('teacher', 'admin'), getTextById);

// Teacher/Admin: assign text to class or students
router.post('/assign', authorize('teacher', 'admin'), createAssignment);
router.get('/assignments/teacher', authorize('teacher', 'admin'), getTeacherAssignments);

// Student: my assigned readings
router.get('/assignments', authorize('student'), myAssignments);

// Student: get simplified text (current user)
router.get('/simplify/:textId', authorize('student'), getSimplifiedForCurrentStudent);
// Teacher/Admin: get simplified text for a specific student
router.get('/simplify/:textId/:studentId', authorize('teacher', 'admin'), getSimplified);

// Student: assess level
router.post('/assess-level', authorize('student'), assessLevel);
// Student (own), Teacher, Admin: get student level
router.get('/student-level/:studentId', authorize('student', 'teacher', 'admin'), getStudentLevel);

// Student: update progress after comprehension quiz
router.patch('/update-progress', authorize('student'), updateProgress);

// Student: get AI feedback on critical thinking answer
router.post('/evaluate-answer', authorize('student'), evaluateCriticalThinkingAnswer);

export default router;
