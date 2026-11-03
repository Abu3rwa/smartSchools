import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { requireFeature } from '../middleware/featureGate.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { aiFeatureRateLimiter, fluencyAttemptRateLimiter, fluencyListenRateLimiter, readingAnswerDraftRateLimiter, readingHeartbeatRateLimiter } from '../middleware/rateLimiters.js';
import { uploadFluencyAudio } from '../middleware/uploadReadingFluencyAudio.js';
import {
  getFluencyAssignment,
  recordFluencyListen,
  recordFluencyConsent,
  scoreFluencyAttempt,
  getFluencyAttempts,
  updateFluencySettings,
  getFluencyClassReport,
  getFluencyStudentReport,
  getFluencyHardWords,
  exportFluencyCsv,
  getModelAudioCoverage,
  generateModelAudio,
  streamModelAudio,
} from '../controllers/readingFluencyController.js';
import {
  uploadText,
  getTexts,
  getTextById,
  getSimplifiedForCurrentStudent,
  getSimplified,
  assessLevel,
  getStudentLevel,
  startReading,
  finishReading,
  recordReadingHeartbeat,
  updateProgress,
  saveAnswersDraft,
  evaluateCriticalThinkingAnswer,
  createAssignment,
  myAssignments,
  getMyBook,
  getTeacherAssignments,
  getAssignmentResults,
  removeAssignment,
  updateAssignmentPublish,
  importReadingCsv,
  updateReading,
  deleteReading,
  updateReadingSharing,
} from '../controllers/readingController.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
router.use(requireFeature('readingAssistant'));

// Teacher/Admin: upload and manage texts
router.post('/upload-text', authorize('teacher', 'admin'), aiFeatureRateLimiter, uploadText);
router.post('/import-csv', authorize('teacher', 'admin'), importReadingCsv);
router.get('/texts', authorize('teacher', 'admin'), getTexts);
router.patch('/texts/:textId', authorize('teacher', 'admin'), express.json(), updateReading);
router.delete('/texts/:textId', authorize('teacher', 'admin'), deleteReading);
router.patch('/texts/:textId/sharing', authorize('teacher', 'admin'), updateReadingSharing);
router.get('/texts/:textId', authorize('teacher', 'admin'), getTextById);

// Teacher/Admin: assign text to class or students
router.post('/assign', authorize('teacher', 'admin'), createAssignment);
router.get('/assignments/teacher', authorize('teacher', 'admin'), getTeacherAssignments);
router.get('/assignments/:assignmentId/results', authorize('teacher', 'admin'), getAssignmentResults);
router.delete('/assignments/:assignmentId', authorize('teacher', 'admin'), removeAssignment);
router.patch('/assignments/:assignmentId/publish', authorize('teacher', 'admin'), express.json(), updateAssignmentPublish);

// Student: my assigned readings
router.get('/assignments', authorize('student'), myAssignments);
// Student: the reading book, including locked chapter stubs
router.get('/book', authorize('student'), getMyBook);

// Student: get simplified text (current user)
router.get('/simplify/:textId', authorize('student'), getSimplifiedForCurrentStudent);
// Teacher/Admin: get simplified text for a specific student
router.get('/simplify/:textId/:studentId', authorize('teacher', 'admin'), getSimplified);

// Student: reading gate timer
router.post('/read-start', authorize('student'), startReading);
router.post('/read-heartbeat', authorize('student'), readingHeartbeatRateLimiter, recordReadingHeartbeat);
router.post('/read-finish', authorize('student'), finishReading);

// Student: assess level
router.post('/assess-level', authorize('student'), aiFeatureRateLimiter, assessLevel);
// Student (own), Teacher, Admin: get student level
router.get('/student-level/:studentId', authorize('student', 'teacher', 'admin'), getStudentLevel);

// Student: update progress after comprehension quiz
router.patch('/update-progress', authorize('student'), updateProgress);
// Student: save answers in progress before submitting
router.put('/answers-draft', authorize('student'), readingAnswerDraftRateLimiter, saveAnswersDraft);

// Student: get AI feedback on critical thinking answer
router.post('/evaluate-answer', authorize('student'), aiFeatureRateLimiter, evaluateCriticalThinkingAnswer);

// Student: reading aloud practice
router.get('/fluency/assignments/:assignmentId', authorize('student'), getFluencyAssignment);
router.post('/fluency/listens', authorize('student'), fluencyListenRateLimiter, recordFluencyListen);
router.post('/fluency/consent', authorize('student'), recordFluencyConsent);
router.post(
  '/fluency/attempts',
  authorize('student'),
  fluencyAttemptRateLimiter,
  uploadFluencyAudio,
  scoreFluencyAttempt
);
router.get(
  '/fluency/assignments/:assignmentId/parts/:blockKey/attempts',
  authorize('student'),
  getFluencyAttempts
);
router.get('/fluency/model-audio/:textId/:blockKey', authorize('student', 'teacher', 'admin'), streamModelAudio);

// Teacher/Admin: reading aloud settings for one assignment
router.patch(
  '/fluency/assignments/:assignmentId/settings',
  authorize('teacher', 'admin'),
  express.json(),
  updateFluencySettings
);

// Teacher/Admin: reading aloud reports
router.get(
  '/fluency/assignments/:assignmentId/results',
  authorize('teacher', 'admin'),
  getFluencyClassReport
);
router.get(
  '/fluency/assignments/:assignmentId/hard-words',
  authorize('teacher', 'admin'),
  getFluencyHardWords
);
router.get(
  '/fluency/assignments/:assignmentId/export.csv',
  authorize('teacher', 'admin'),
  exportFluencyCsv
);
router.get(
  '/fluency/assignments/:assignmentId/students/:studentId',
  authorize('teacher', 'admin'),
  getFluencyStudentReport
);

// Teacher/Admin: model voice coverage and generation
router.get(
  '/fluency/texts/:textId/model-audio',
  authorize('teacher', 'admin'),
  getModelAudioCoverage
);
router.post(
  '/fluency/texts/:textId/model-audio',
  authorize('teacher', 'admin'),
  aiFeatureRateLimiter,
  express.json(),
  generateModelAudio
);

export default router;
