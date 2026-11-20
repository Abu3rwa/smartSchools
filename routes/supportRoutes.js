import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { requireFeature } from '../middleware/featureGate.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { emailSendRateLimiter } from '../middleware/rateLimiters.js';
import { assertSupportActive } from '../services/supportSettingsService.js';
import {
    addExternal,
    approve,
    checkIn,
    createCycles,
    generateDraft,
    getClassCycles,
    getClasses,
    getCycle,
    history,
    publish,
    rotateCode,
    sendInvites,
} from '../controllers/supportController.js';
import {
    addContactEndpoint,
    addNote,
    approveQuestionEndpoint,
    approveVersion,
    assistedResponse,
    cancelPlanning,
    checkIn as caseCheckIn,
    closeCaseEndpoint,
    confirmSuggestionEndpoint,
    createCaseEndpoint,
    createQuestion,
    createObservation,
    dismissSuggestionEndpoint,
    downloadReportCsv,
    draftPlan,
    getBank,
    getCase,
    getCases,
    getClassScope,
    getEvidence,
    getIntegration,
    getAttention,
    getReport,
    getRequests,
    getReview,
    getSettings,
    getSuggestions,
    getVersions,
    goalOutcome,
    issuePlanning,
    markHandedOver,
    newsletterSummary,
    preparePlanning,
    previewPlanning,
    printReport,
    printSlips,
    publishVersion,
    reopenSurvey,
    respondToRequest,
    retireQuestionEndpoint,
    retryPlanning,
    reviseQuestionEndpoint,
    updateCaseEndpoint,
    updateSettings,
    updateVersion,
} from '../controllers/supportWorkbenchController.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
router.use(authorize('teacher', 'admin', 'super_admin', 'counselor', 'nurse'));
router.use(requireFeature('studentSupport'));

/* Switching support off pauses work: staff keep read-only history, and only
   the settings switch itself stays writable so the school can turn it back on. */
const pauseWrites = asyncHandler(async (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    if (req.method === 'PUT' && req.path === '/settings') return next();
    await assertSupportActive({ schoolId: req.schoolId });
    return next();
});
router.use(pauseWrites);

/* Settings and the approved question bank. */
router.get('/settings', getSettings);
router.put('/settings', updateSettings);
router.get('/bank', getBank);
router.post('/bank', createQuestion);
router.post('/bank/:questionId/revise', reviseQuestionEndpoint);
router.post('/bank/:questionId/retire', retireQuestionEndpoint);
router.post('/bank/:questionId/approve', approveQuestionEndpoint);

/* Cases, requests and suggestions. */
router.get('/classes/:classId/scope', getClassScope);
router.get('/cases', getCases);
router.post('/cases', createCaseEndpoint);
router.get('/cases/:caseId', getCase);
router.patch('/cases/:caseId', updateCaseEndpoint);
router.post('/cases/:caseId/notes', addNote);
router.post('/cases/:caseId/close', closeCaseEndpoint);
router.post('/cases/:caseId/contacts', addContactEndpoint);
router.get('/cases/:caseId/evidence', getEvidence);
router.get('/attention', getAttention);
router.get('/requests', getRequests);
router.post('/requests/:caseId/respond', respondToRequest);
router.get('/suggestions', getSuggestions);
router.post('/suggestions/dismiss', dismissSuggestionEndpoint);
router.post('/suggestions/confirm', confirmSuggestionEndpoint);

/* Survey planning, issuing and printed slips. */
router.post('/cases/:caseId/reviews/preview', previewPlanning);
router.post('/cases/:caseId/reviews/prepare', preparePlanning);
router.get('/cases/:caseId/reviews/:reviewId', getReview);
router.post('/cases/:caseId/reviews/:reviewId/issue', emailSendRateLimiter, issuePlanning);
router.post('/cases/:caseId/reviews/:reviewId/retry', emailSendRateLimiter, retryPlanning);
router.post('/cases/:caseId/reviews/:reviewId/cancel', cancelPlanning);
router.get('/cases/:caseId/reviews/:reviewId/slips', printSlips);
router.post('/cases/:caseId/surveys/:surveyId/handed-over', markHandedOver);
router.post('/cases/:caseId/surveys/:surveyId/assisted', assistedResponse);
router.post('/cases/:caseId/surveys/:surveyId/reopen', reopenSurvey);

/* Coordinated plan versions and check-ins. */
router.get('/cases/:caseId/plan/versions', getVersions);
router.post('/cases/:caseId/plan/draft', draftPlan);
router.patch('/cases/:caseId/plan/versions/:versionId', updateVersion);
router.post('/cases/:caseId/plan/versions/:versionId/approve', approveVersion);
router.post('/cases/:caseId/plan/versions/:versionId/publish', publishVersion);
router.post('/cases/:caseId/plan/versions/:versionId/goals/:goalId/outcome', goalOutcome);
router.post('/cases/:caseId/checkins', caseCheckIn);

/* Integrations and reports. */
router.get('/integration', getIntegration);
router.get('/cases/:caseId/newsletter-summary', newsletterSummary);
router.post('/cases/:caseId/observations', createObservation);
router.get('/reports', getReport);
router.get('/reports/csv', downloadReportCsv);
router.get('/reports/print', printReport);

/* Legacy cycle workflow kept for existing clients. */
router.get('/classes', getClasses);
router.get('/cycles', getClassCycles);
router.post('/cycles', createCycles);
router.get('/cycles/:cycleId', getCycle);

router.post('/cycles/:cycleId/external-teacher', addExternal);
router.post('/cycles/:cycleId/respondents/:respondentId/code', rotateCode);
router.post('/cycles/:cycleId/invite', emailSendRateLimiter, sendInvites);

router.post('/cycles/:cycleId/plan/draft', generateDraft);
router.post('/cycles/:cycleId/plan/approve', approve);
router.post('/cycles/:cycleId/plan/publish', publish);
router.post('/cycles/:cycleId/checkins', checkIn);

router.get('/students/:studentId/history', history);

export default router;
