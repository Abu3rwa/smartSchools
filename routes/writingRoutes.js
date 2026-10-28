import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { requireFeature } from '../middleware/featureGate.js';
import { aiFeatureRateLimiter, emailSendRateLimiter } from '../middleware/rateLimiters.js';
import {
    assessAssignment,
    assessDraft,
    autosaveProject,
    compareDraft,
    createAssignment,
    deactivateAssignment,
    getAssignment,
    getBoard,
    getProgress,
    getProjectHistory,
    instantiateTemplate,
    listAssignments,
    listTemplates,
    markNotebookWritten,
    myProject,
    myProjectById,
    myWriting,
    overrideProjectStage,
    previewFeedbackEmail,
    publishAssessment,
    recordNotebookReview,
    resendFeedbackEmail,
    saveAssessmentEdits,
    saveAsTemplate,
    submitProject,
    updateAssignment
} from '../controllers/writingController.js';
import {
    allocateCredit,
    cancelCreditRequest,
    decideCreditRequest,
    getMyCredit,
    getMyCreditHistory,
    getTeacherCreditHistory,
    listCreditAccounts,
    reclaimCredit,
    requestCredit,
    updateCreditSettings
} from '../controllers/aiCreditController.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
router.use(requireFeature('writingAssistant'));

const staff = authorize('teacher', 'admin', 'super_admin');
const admin = authorize('admin', 'super_admin');

/* Teacher: assignment configuration */
router.post('/assignments', staff, createAssignment);
router.get('/assignments', staff, listAssignments);
router.get('/assignments/:assignmentId', staff, getAssignment);
router.patch('/assignments/:assignmentId', staff, updateAssignment);
router.delete('/assignments/:assignmentId', staff, deactivateAssignment);

/* Teacher: templates */
router.get('/templates', staff, listTemplates);
router.post('/assignments/:assignmentId/template', staff, saveAsTemplate);
router.post('/templates/:templateId/instantiate', staff, instantiateTemplate);

/* Teacher: progress and history */
router.get('/assignments/:assignmentId/board', staff, getBoard);
router.get('/assignments/:assignmentId/progress', staff, getProgress);
router.get('/projects/:projectId/history', staff, getProjectHistory);

/* Teacher: assessment, review and publication (the AI ones are rate limited) */
router.post('/assignments/:assignmentId/assess', staff, aiFeatureRateLimiter, assessAssignment);
router.post('/drafts/:draftId/assess', staff, aiFeatureRateLimiter, assessDraft);
router.post('/drafts/:draftId/compare', staff, aiFeatureRateLimiter, compareDraft);
router.patch('/assessments/:assessmentId', staff, saveAssessmentEdits);
router.post('/assessments/:assessmentId/publish', staff, publishAssessment);
router.post('/assessments/:assessmentId/email-preview', staff, previewFeedbackEmail);
router.post('/assessments/:assessmentId/resend-email', staff, emailSendRateLimiter, resendFeedbackEmail);
router.post('/projects/:projectId/stage', staff, overrideProjectStage);
router.post('/projects/:projectId/notebook', staff, recordNotebookReview);

/* Teacher: prepaid AI credit (the school pool funds it; AI runs debit it) */
router.get('/credit', staff, getMyCredit);
router.get('/credit/history', staff, getMyCreditHistory);
router.post('/credit/requests', staff, requestCredit);
router.post('/credit/requests/:requestId/cancel', staff, cancelCreditRequest);

/* School admin: read usage, move reserve credit, answer teacher requests */
router.get('/credit/accounts', admin, listCreditAccounts);
router.get('/credit/accounts/:userId/history', admin, getTeacherCreditHistory);
router.post('/credit/accounts/:userId/allocate', admin, allocateCredit);
router.post('/credit/accounts/:userId/reclaim', admin, reclaimCredit);
router.patch('/credit/accounts/:userId', admin, updateCreditSettings);
router.post('/credit/requests/:requestId/decide', admin, decideCreditRequest);

/*
 * Student. These routes read published feedback only and never reach the AI
 * assessment path — see tests/writingAssistantAiBoundary.test.js.
 */
router.get('/my', authorize('student'), myWriting);
router.post('/assignments/:assignmentId/open', authorize('student'), myProject);
router.get('/projects/:projectId', authorize('student'), myProjectById);
router.put('/projects/:projectId/autosave', authorize('student'), autosaveProject);
router.post('/projects/:projectId/submit', authorize('student'), submitProject);
router.post('/projects/:projectId/notebook-written', authorize('student'), markNotebookWritten);

export default router;
