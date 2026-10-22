import express from 'express';
import multer from 'multer';
import path from 'path';
import { authorize, protect } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import uploadImportTemplate from '../middleware/uploadImportTemplate.js';
import {
    commitSpellingWords,
    previewSpellingWords
} from '../controllers/spellingImportController.js';
import {
    abandonSession,
    cancelScheduledSession,
    completeSession,
    createSpellingIntegrityEvent,
    getSpellingIntegrityEvents,
    getCurrentItem,
    listRaisedHands,
    lowerHand,
    markAttemptCorrect,
    raiseHand,
    recordAttempt,
    startSession
} from '../controllers/spellingSessionController.js';
import {
    getSession,
    getActiveSession,
    getPrepTestReadiness,
    listRetests,
    listSessions
} from '../controllers/spellingReadController.js';
import {
    classSpellingDocx,
    spellingDashboard,
    studentSpellingDocx
} from '../controllers/spellingReportController.js';
import {
    deleteSpellingWord,
    exportSpellingWordAudioLibrary,
    exportSpellingWordLibrary,
    listSpellingWords,
    updateSpellingWord
} from '../controllers/spellingWordController.js';
import { exportStudentSpellingDetailsDocx, getStudentSpellingDetails } from '../controllers/spellingDetailsController.js';
import { getClassSettings, updateClassSettings } from '../controllers/spellingClassSettingsController.js';
import { getDictionaryWord } from '../controllers/dictionaryController.js';
import {
    importWordAudioCsv,
    deleteWordAudioExample,
    listWordAudioSettings,
    replaceWordPronunciation,
    replaceWordAudioExample,
    searchWordAudio,
    updateWordAudioSetting,
    wordAudioCoverage
} from '../controllers/wordAudioController.js';
import { approvePassage, cancelPassageSend, discardPassage, generatePassage, getPassage, sendPassage, updatePassage } from '../controllers/spellingPassageController.js';
import { updateStudentSpellingPlacement } from '../controllers/spellingStudentController.js';

const router = express.Router();
const wordAudioImportUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => {
        const extension = path.extname(String(file.originalname || '')).toLowerCase();
        const mimeType = String(file.mimetype || '').toLowerCase();
        if (extension === '.csv' && (!mimeType || ['text/csv', 'application/vnd.ms-excel'].includes(mimeType))) {
            cb(null, true);
            return;
        }
        cb(new Error('Invalid CSV file type. Allowed format: .csv'), false);
    }
});

router.use(protect, requireSchoolContext);
router.use('/word-lists', authorize('admin', 'department_principal', 'teacher'));
router.get('/word-lists', listSpellingWords);
router.get('/word-lists/export', exportSpellingWordLibrary);
router.get('/word-audio/export', exportSpellingWordAudioLibrary);
router.patch('/word-lists/:wordId', express.json(), authorize('admin', 'department_principal', 'teacher'), updateSpellingWord);
router.delete('/word-lists/:wordId', authorize('admin', 'department_principal', 'teacher'), deleteSpellingWord);
router.get('/dictionary/:word', getDictionaryWord);
router.get('/classes/:classId/settings', authorize('admin', 'department_principal', 'teacher'), getClassSettings);
router.patch('/classes/:classId/settings', express.json(), authorize('admin', 'department_principal', 'teacher'), updateClassSettings);
router.get('/students/:studentId/details', authorize('admin', 'department_principal', 'teacher'), getStudentSpellingDetails);
router.get('/students/:studentId/details/docx', authorize('admin', 'department_principal', 'teacher'), exportStudentSpellingDetailsDocx);
router.patch('/students/:studentId/placement', authorize('admin', 'department_principal', 'teacher'), express.json(), updateStudentSpellingPlacement);
router.post('/word-lists/import/preview', authorize('admin'), uploadImportTemplate.single('file'), previewSpellingWords);
router.post('/word-lists/import/commit', authorize('admin'), express.json(), commitSpellingWords);
router.post('/word-audio/import', authorize('admin'), wordAudioImportUpload.single('file'), importWordAudioCsv);
router.get('/word-audio/search', authorize('admin'), searchWordAudio);
router.delete('/word-audio/examples', express.json(), authorize('admin'), deleteWordAudioExample);
router.patch('/word-audio/examples', express.json(), authorize('admin'), replaceWordAudioExample);
router.patch('/word-audio/pronunciation', express.json(), authorize('admin'), replaceWordPronunciation);
router.get('/word-audio/coverage', authorize('admin'), wordAudioCoverage);
router.get('/word-audio/settings', authorize('admin'), listWordAudioSettings);
router.put('/word-audio/settings/:grade', authorize('admin'), express.json(), updateWordAudioSetting);
router.use('/sessions', authorize('admin', 'department_principal', 'teacher', 'student'));
router.post('/sessions', authorize('admin', 'department_principal', 'teacher'), startSession);
router.get('/sessions', listSessions);
router.get('/sessions/active', getActiveSession);
router.get('/sessions/hands', authorize('admin', 'department_principal', 'teacher'), listRaisedHands);
router.post('/sessions/:id/raise-hand', authorize('student'), express.json(), raiseHand);
router.post('/sessions/:id/lower-hand', authorize('admin', 'department_principal', 'teacher'), lowerHand);
router.get('/sessions/:id/current-item', getCurrentItem);
router.post('/sessions/:id/integrity-events', authorize('student'), createSpellingIntegrityEvent);
router.get('/sessions/:id/integrity-events', authorize('admin', 'department_principal', 'teacher'), getSpellingIntegrityEvents);
router.patch('/sessions/:id/attempt', recordAttempt);
router.patch('/sessions/:id/attempts/:attemptId/correct', authorize('admin', 'department_principal', 'teacher'), express.json(), markAttemptCorrect);
router.post('/sessions/:id/complete', completeSession);
router.post('/sessions/:id/cancel-scheduled', authorize('admin', 'department_principal', 'teacher'), cancelScheduledSession);
router.post('/sessions/:id/abandon', abandonSession);
router.get('/sessions/:id', getSession);
router.get('/sessions/:id/passage', getPassage);
router.post('/sessions/:id/passage/generate', express.json(), generatePassage);
router.patch('/sessions/:id/passage', express.json(), updatePassage);
router.post('/sessions/:id/passage/approve', approvePassage);
router.post('/sessions/:id/passage/send', sendPassage);
router.post('/sessions/:id/passage/cancel-send', cancelPassageSend);
router.post('/sessions/:id/passage/discard', discardPassage);
router.get('/retest-queue', listRetests);
router.get('/prep-test-readiness', authorize('admin', 'department_principal', 'teacher'), getPrepTestReadiness);
router.use('/reports', authorize('admin', 'department_principal', 'teacher'));
router.get('/reports/student/:studentId/docx', studentSpellingDocx);
router.get('/reports/class/:classId/docx', classSpellingDocx);
router.get('/dashboard', authorize('admin', 'department_principal', 'teacher'), spellingDashboard);

export default router;
