import express from "express";
import { protect, authorize } from "../middleware/auth.js";
import { requireSchoolContext } from "../middleware/tenantIsolation.js";
import { requireFeature } from "../middleware/featureGate.js";
import {
  aiFeatureRateLimiter,
  emailSendRateLimiter,
} from "../middleware/rateLimiters.js";
import {
  assessAssignment,
  assessDraft,
  autosaveProject,
  compareDraft,
  createAssignment,
  deactivateAssignment,
  printProject,
  printProjectForTeacher,
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
  previewWordSupport,
  publishAssessment,
  recordNotebookReview,
  reportPasteAttempt,
  resendFeedbackEmail,
  saveAssessmentEdits,
  saveAsTemplate,
  submitProject,
  updateAssignment,
} from "../controllers/writingController.js";
import {
  createAnalysis,
  getAnalysis,
  getAnalysisScope,
  getPublishPreview,
  listAnalyses,
  publishAnalysis,
  retryAnalysis,
  updateAnalysis,
} from "../controllers/writingAnalysisController.js";

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
router.use(requireFeature("writingAssistant"));

const staff = authorize("teacher", "admin", "super_admin");

/* Teacher: assignment configuration */
router.post("/assignments", staff, createAssignment);
router.get("/assignments", staff, listAssignments);
router.get("/assignments/:assignmentId", staff, getAssignment);
router.patch("/assignments/:assignmentId", staff, updateAssignment);
router.delete("/assignments/:assignmentId", staff, deactivateAssignment);
router.post(
  "/assignments/:assignmentId/word-support/preview",
  staff,
  previewWordSupport,
);

/* Teacher: templates */
router.get("/templates", staff, listTemplates);
router.post("/assignments/:assignmentId/template", staff, saveAsTemplate);
router.post("/templates/:templateId/instantiate", staff, instantiateTemplate);

/* Teacher: progress and history */
router.get("/assignments/:assignmentId/board", staff, getBoard);
router.get("/assignments/:assignmentId/progress", staff, getProgress);
router.get("/projects/:projectId/history", staff, getProjectHistory);
router.get(
  "/projects/:projectId/print/teacher",
  staff,
  printProjectForTeacher,
);

/* Teacher: assessment, review and publication (the AI ones are rate limited) */
router.post(
  "/assignments/:assignmentId/assess",
  staff,
  aiFeatureRateLimiter,
  assessAssignment,
);
router.post(
  "/drafts/:draftId/assess",
  staff,
  aiFeatureRateLimiter,
  assessDraft,
);
router.post(
  "/drafts/:draftId/compare",
  staff,
  aiFeatureRateLimiter,
  compareDraft,
);
router.patch("/assessments/:assessmentId", staff, saveAssessmentEdits);
router.post("/assessments/:assessmentId/publish", staff, publishAssessment);
router.post(
  "/assessments/:assessmentId/email-preview",
  staff,
  previewFeedbackEmail,
);
router.post(
  "/assessments/:assessmentId/resend-email",
  staff,
  emailSendRateLimiter,
  resendFeedbackEmail,
);
router.post("/projects/:projectId/stage", staff, overrideProjectStage);
router.post("/projects/:projectId/notebook", staff, recordNotebookReview);

/* Teacher: longitudinal analysis against standards (staff only, never students) */
router.get("/analysis/scope", staff, getAnalysisScope);
router.get("/analysis", staff, listAnalyses);
router.post("/analysis", staff, aiFeatureRateLimiter, createAnalysis);
router.get("/analysis/:analysisId", staff, getAnalysis);
router.get("/analysis/:analysisId/publish-preview", staff, getPublishPreview);
router.patch("/analysis/:analysisId", staff, updateAnalysis);
router.post(
  "/analysis/:analysisId/retry",
  staff,
  aiFeatureRateLimiter,
  retryAnalysis,
);
router.post("/analysis/:analysisId/publish", staff, publishAnalysis);

/*
 * Student. These routes read published feedback only and never reach the AI
 * assessment path — see tests/writingAssistantAiBoundary.test.js.
 */
router.get("/my", authorize("student"), myWriting);
router.post("/assignments/:assignmentId/open", authorize("student"), myProject);
router.get("/projects/:projectId", authorize("student"), myProjectById);
router.get(
  "/projects/:projectId/print",
  authorize("student"),
  printProject,
);
router.put(
  "/projects/:projectId/autosave",
  authorize("student"),
  autosaveProject,
);
router.post(
  "/projects/:projectId/paste-attempts",
  authorize("student"),
  reportPasteAttempt,
);
router.post("/projects/:projectId/submit", authorize("student"), submitProject);
router.post(
  "/projects/:projectId/notebook-written",
  authorize("student"),
  markNotebookWritten,
);

export default router;
