import express from 'express';
import { authorize, protect } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import uploadImportTemplate from '../middleware/uploadImportTemplate.js';
import {
    commitSpellingWords,
    previewSpellingWords
} from '../controllers/spellingImportController.js';
import {
    abandonSession,
    completeSession,
    createSpellingIntegrityEvent,
    getSpellingIntegrityEvents,
    getCurrentItem,
    recordAttempt,
    startSession
} from '../controllers/spellingSessionController.js';
import {
    getSession,
    getActiveSession,
    listRetests,
    listSessions
} from '../controllers/spellingReadController.js';
import {
    classSpellingDocx,
    spellingDashboard,
    studentSpellingDocx
} from '../controllers/spellingReportController.js';
import { listSpellingWords } from '../controllers/spellingWordController.js';
import { getStudentSpellingDetails } from '../controllers/spellingDetailsController.js';
import { getClassSettings, updateClassSettings } from '../controllers/spellingClassSettingsController.js';
import { getDictionaryWord } from '../controllers/dictionaryController.js';
import { approvePassage, discardPassage, generatePassage, getPassage, sendPassage, updatePassage } from '../controllers/spellingPassageController.js';

const router = express.Router();

router.use(protect, requireSchoolContext);
router.use('/word-lists', authorize('admin', 'department_principal', 'teacher'));
router.get('/word-lists', listSpellingWords);
router.get('/dictionary/:word', getDictionaryWord);
router.get('/classes/:classId/settings', authorize('admin', 'department_principal', 'teacher'), getClassSettings);
router.patch('/classes/:classId/settings', express.json(), authorize('admin', 'department_principal', 'teacher'), updateClassSettings);
router.get('/students/:studentId/details', authorize('admin', 'department_principal', 'teacher'), getStudentSpellingDetails);
router.post('/word-lists/import/preview', uploadImportTemplate.single('file'), previewSpellingWords);
router.post('/word-lists/import/commit', express.json(), commitSpellingWords);
router.use('/sessions', authorize('admin', 'department_principal', 'teacher', 'student'));
router.post('/sessions', startSession);
router.get('/sessions', listSessions);
router.get('/sessions/active', getActiveSession);
router.get('/sessions/:id/current-item', getCurrentItem);
router.post('/sessions/:id/integrity-events', authorize('student'), createSpellingIntegrityEvent);
router.get('/sessions/:id/integrity-events', authorize('admin', 'department_principal', 'teacher'), getSpellingIntegrityEvents);
router.patch('/sessions/:id/attempt', recordAttempt);
router.post('/sessions/:id/complete', completeSession);
router.post('/sessions/:id/abandon', abandonSession);
router.get('/sessions/:id', getSession);
router.get('/sessions/:id/passage', getPassage);
router.post('/sessions/:id/passage/generate', express.json(), generatePassage);
router.patch('/sessions/:id/passage', express.json(), updatePassage);
router.post('/sessions/:id/passage/approve', approvePassage);
router.post('/sessions/:id/passage/send', sendPassage);
router.post('/sessions/:id/passage/discard', discardPassage);
router.get('/retest-queue', listRetests);
router.use('/reports', authorize('admin', 'department_principal', 'teacher'));
router.get('/reports/student/:studentId/docx', studentSpellingDocx);
router.get('/reports/class/:classId/docx', classSpellingDocx);
router.get('/dashboard', authorize('admin', 'department_principal', 'teacher'), spellingDashboard);

export default router;
