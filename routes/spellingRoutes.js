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
    markAttemptIncorrect,
    raiseHand,
    recordAttempt,
    startSession,
    undoAttemptCorrection
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
    bulkUpdateSpellingWords,
    createSpellingWord,
    deleteSpellingWord,
    exportSpellingWordAudioLibrary,
    exportSpellingWordLibrary,
    getSpellingWord,
    listSpellingWords,
    moveSpellingWord,
    previewSpellingLibraryImpact,
    reorderSpellingWeek,
    spellingWordHistory,
    updateSpellingWord
} from '../controllers/spellingWordController.js';
import { domainError, spellingDomainErrorHandler } from '../utils/spellingLibraryErrors.js';
import { spellingCorrectionRateLimiter, spellingLibraryWriteRateLimiter } from '../middleware/rateLimiters.js';
import { exportStudentSpellingDetailsDocx, getStudentSpellingDetails } from '../controllers/spellingDetailsController.js';
import { getClassSettings, updateClassSettings } from '../controllers/spellingClassSettingsController.js';
import { getDictionaryWord } from '../controllers/dictionaryController.js';
import {
    aiAudioCoverage,
    aiAudioSettings,
    flagPronunciationIssue,
    generateAiWordAudio,
    getPronunciationAudio,
    importWordAudioCsv,
    deleteWordAudioExample,
    listWordAudioSettings,
    pronunciationReviewQueue,
    regenerateAiPronunciation,
    removeAiPronunciation,
    replaceWordAudioExample,
    reviewPronunciation,
    searchWordAudio,
    updateAiAudioSettings,
    updateWordAudioSetting,
    wordAudioCoverage
} from '../controllers/wordAudioController.js';
import { approvePassage, cancelPassageSend, discardPassage, generatePassage, getPassage, sendPassage, updatePassage } from '../controllers/spellingPassageController.js';
import { updateStudentSpellingPlacement } from '../controllers/spellingStudentController.js';
import {
    createParentDraft,
    explainCohort,
    getCohort,
    getStudentAnalysis,
    listAnalysisStudents,
    runStudentAnalysis,
    sendParentDraft,
    updateParentDraft
} from '../controllers/spellingAnalysisController.js';
import { requireFeature } from '../middleware/featureGate.js';

const router = express.Router();
const requireSpellingAnalysis = requireFeature('spellingAnalysis');
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

const spellingImportUpload = (req, res, next) => {
    uploadImportTemplate.single('file')(req, res, (error) => {
        if (!error) {
            next();
            return;
        }
        next(domainError(error?.code === 'LIMIT_FILE_SIZE' ? 'PAYLOAD_TOO_LARGE' : 'FILE_TYPE'));
    });
};

// Sound files are fetched by an <audio> element, which cannot send the Bearer token.
router.get('/pronunciation/:publicId', getPronunciationAudio);
router.use(protect, requireSchoolContext);
router.use('/word-lists', authorize('admin', 'department_principal', 'teacher'));
router.get('/word-lists', listSpellingWords);
router.get('/word-lists/export', exportSpellingWordLibrary);
router.get('/word-audio/export', exportSpellingWordAudioLibrary);
// Literal paths must stay above /:wordId so they are never read as an ID.
router.post('/word-lists/impact-preview', express.json(), spellingLibraryWriteRateLimiter, previewSpellingLibraryImpact);
router.patch('/word-lists/bulk', express.json(), spellingLibraryWriteRateLimiter, bulkUpdateSpellingWords);
router.put('/word-lists/grades/:grade/weeks/:week/order', express.json(), spellingLibraryWriteRateLimiter, reorderSpellingWeek);
router.post('/word-lists/import/preview', authorize('admin'), spellingLibraryWriteRateLimiter, spellingImportUpload, previewSpellingWords);
router.post('/word-lists/import/commit', authorize('admin'), spellingLibraryWriteRateLimiter, express.json(), commitSpellingWords);
router.post('/word-lists', express.json(), spellingLibraryWriteRateLimiter, createSpellingWord);
router.get('/word-lists/:wordId/history', spellingWordHistory);
router.get('/word-lists/:wordId', getSpellingWord);
router.post('/word-lists/:wordId/move', express.json(), spellingLibraryWriteRateLimiter, moveSpellingWord);
router.patch('/word-lists/:wordId', express.json(), spellingLibraryWriteRateLimiter, updateSpellingWord);
router.delete('/word-lists/:wordId', express.json(), spellingLibraryWriteRateLimiter, deleteSpellingWord);
router.get('/dictionary/:word', getDictionaryWord);
router.get('/classes/:classId/settings', authorize('admin', 'department_principal', 'teacher'), getClassSettings);
router.patch('/classes/:classId/settings', express.json(), authorize('admin', 'department_principal', 'teacher'), updateClassSettings);
router.get('/students/:studentId/details', authorize('admin', 'department_principal', 'teacher'), getStudentSpellingDetails);
router.get('/students/:studentId/details/docx', authorize('admin', 'department_principal', 'teacher'), exportStudentSpellingDetailsDocx);
router.patch('/students/:studentId/placement', authorize('admin', 'department_principal', 'teacher'), express.json(), updateStudentSpellingPlacement);
router.post('/word-audio/import', authorize('admin'), wordAudioImportUpload.single('file'), importWordAudioCsv);
router.get('/word-audio/search', authorize('admin'), searchWordAudio);
router.delete('/word-audio/examples', express.json(), authorize('admin'), deleteWordAudioExample);
router.patch('/word-audio/examples', express.json(), authorize('admin'), replaceWordAudioExample);
router.delete('/word-audio/ai/pronunciation', express.json(), authorize('admin'), removeAiPronunciation);
router.post('/word-audio/ai/pronunciation/regenerate', express.json(), authorize('admin'), regenerateAiPronunciation);
router.get('/word-audio/coverage', authorize('admin'), wordAudioCoverage);
router.get('/word-audio/settings', authorize('admin'), listWordAudioSettings);
router.put('/word-audio/settings/:grade', authorize('admin'), express.json(), updateWordAudioSetting);
router.get('/word-audio/ai/settings', authorize('admin'), aiAudioSettings);
router.put('/word-audio/ai/settings', authorize('admin'), express.json(), updateAiAudioSettings);
router.get('/word-audio/ai/coverage', authorize('admin'), aiAudioCoverage);
router.post('/word-audio/ai/generate', authorize('admin'), express.json(), generateAiWordAudio);
// Reviewing the clips: a teacher may only work on the grades they teach, and
// only an admin may regenerate, because that spends the school's AI credits.
router.get('/word-audio/review/queue', authorize('admin', 'department_principal', 'teacher'), pronunciationReviewQueue);
router.post('/word-audio/review', express.json(), authorize('admin', 'department_principal', 'teacher'), reviewPronunciation);
router.post('/word-audio/review/flag', express.json(), authorize('admin', 'department_principal', 'teacher'), flagPronunciationIssue);
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
const correctionJson = express.json({ limit: '32kb' });
router.patch('/sessions/:id/attempts/:attemptId/correct', authorize('admin', 'department_principal', 'teacher'), correctionJson, spellingCorrectionRateLimiter, markAttemptCorrect);
router.patch('/sessions/:id/attempts/:attemptId/incorrect', authorize('admin', 'department_principal', 'teacher'), correctionJson, spellingCorrectionRateLimiter, markAttemptIncorrect);
router.post('/sessions/:id/attempts/:attemptId/undo-correction', authorize('admin', 'department_principal', 'teacher'), correctionJson, spellingCorrectionRateLimiter, undoAttemptCorrection);
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

// Spelling Analysis — platform-enabled, admin-run, metered per student.
router.get('/analysis/students', authorize('admin'), requireSpellingAnalysis, listAnalysisStudents);
router.get('/analysis/students/:studentId', authorize('admin'), requireSpellingAnalysis, getStudentAnalysis);
router.post('/analysis/students/:studentId/run', authorize('admin'), requireSpellingAnalysis, express.json(), runStudentAnalysis);
router.get('/analysis/cohort', authorize('admin'), requireSpellingAnalysis, getCohort);
router.post('/analysis/cohort/narrative', authorize('admin'), requireSpellingAnalysis, express.json(), explainCohort);
router.post('/analysis/students/:studentId/parent-draft', authorize('admin'), requireSpellingAnalysis, express.json(), createParentDraft);
router.patch('/analysis/parent-drafts/:draftId', authorize('admin'), requireSpellingAnalysis, express.json(), updateParentDraft);
router.post('/analysis/parent-drafts/:draftId/send', authorize('admin', 'teacher'), requireSpellingAnalysis, express.json(), sendParentDraft);

router.use(spellingDomainErrorHandler);

export default router;
