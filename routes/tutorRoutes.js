import express from 'express';
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
    getPractice,
    giveCredits,
    importLessons,
    myTutorHistory,
    myTutorHome,
    pauseStudent,
    removeLesson,
    teacherConversation,
    teacherConversations,
    updateClassAccess,
    updateSettings
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
router.put('/admin/students/:studentId/pause', admin, pauseStudent);
router.get('/admin/subjects', admin, adminSubjects);
router.get('/admin/standards', admin, adminStandards);
router.get('/admin/lessons', admin, adminLessons);
router.post('/admin/lessons/import', admin, importLessons);
router.delete('/admin/lessons/:lessonId', admin, removeLesson);

/* Teacher, and admins who also teach */
router.get('/conversations', staff, teacherConversations);
router.get('/conversations/:conversationId', staff, teacherConversation);

/* Student */
router.get('/me', authorize('student'), myTutorHome);
router.get('/history', authorize('student'), myTutorHistory);
router.post('/ask', authorize('student'), tutorRateLimiter, askTutor);
router.post('/practice', authorize('student'), tutorRateLimiter, createPractice);
router.get('/practice/:practiceId', authorize('student'), getPractice);
router.post('/practice/:practiceId/submit', authorize('student'), answerPractice);

export default router;
