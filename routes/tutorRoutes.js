import express from 'express';
import multer from 'multer';
import { protect, authorize } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { requireFeature } from '../middleware/featureGate.js';
import { tutorRateLimiter } from '../middleware/rateLimiters.js';
import {
    adminLessons,
    adminOverview,
    adminStandards,
    adminStudents,
    adminSubjects,
    answerPractice,
    askTutor,
    createPractice,
    distributeCredits,
    endVoiceSession,
    getPractice,
    getVoiceSession,
    giveCredits,
    giveVoiceCredit,
    importLessons,
    myTutorHistory,
    myTutorHome,
    myVoiceHome,
    pauseStudent,
    removeLesson,
    setStudentLevel,
    startVoiceSession,
    teacherConversation,
    teacherConversations,
    updateClassAccess,
    updateSettings,
    voiceTurn
} from '../controllers/tutorController.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
router.use(requireFeature('studentAiTutor'));

const staff = authorize('teacher', 'admin', 'super_admin');
const admin = authorize('admin', 'super_admin');

/* Admin: the controls, matched before any /:id route */
router.get('/admin/overview', admin, adminOverview);
router.patch('/admin/settings', admin, updateSettings);
router.put('/admin/classes/:classId', admin, updateClassAccess);
router.get('/admin/students', admin, adminStudents);
router.post('/admin/credits/distribute', admin, distributeCredits);
router.post('/admin/credits/give', admin, giveCredits);
router.post('/admin/credits/voice', admin, giveVoiceCredit);
router.put('/admin/students/:studentId/pause', admin, pauseStudent);
router.put('/admin/students/:studentId/level', admin, setStudentLevel);
router.get('/admin/subjects', admin, adminSubjects);
router.get('/admin/standards', admin, adminStandards);
router.get('/admin/lessons', admin, adminLessons);
router.post('/admin/lessons/import', admin, importLessons);
router.delete('/admin/lessons/:lessonId', admin, removeLesson);

/* Teacher, and admins who also teach */
router.get('/conversations', staff, teacherConversations);
router.get('/conversations/:conversationId', staff, teacherConversation);

/* Student */
// One recording per turn, kept in memory and discarded after transcription.
const voiceUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, done) => done(null, /^audio\//i.test(file.mimetype))
});

router.get('/me', authorize('student'), myTutorHome);
router.get('/history', authorize('student'), myTutorHistory);
router.post('/ask', authorize('student'), tutorRateLimiter, askTutor);
router.post('/practice', authorize('student'), tutorRateLimiter, createPractice);
router.get('/practice/:practiceId', authorize('student'), getPractice);
router.post('/practice/:practiceId/submit', authorize('student'), answerPractice);

/* Premium voice tutor */
router.get('/voice', authorize('student'), myVoiceHome);
router.post('/voice/sessions', authorize('student'), tutorRateLimiter, startVoiceSession);
router.get('/voice/sessions/:sessionId', authorize('student'), getVoiceSession);
router.post('/voice/sessions/:sessionId/turn', authorize('student'), tutorRateLimiter, voiceUpload.single('audio'), voiceTurn);
router.post('/voice/sessions/:sessionId/end', authorize('student'), endVoiceSession);

export default router;
