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
  assessmentEvidenceFacts,
  autosaveProject,
  bulkPublish,
  cancelBatchRun,
  compareDraft,
  createAssignment,
  createSourcePack,
  deactivateAssignment,
  deleteCommentBankNote,
  getBatchRun,
  printProject,
  printProjectForTeacher,
  getAssignment,
  getAssignmentInsight,
  getAssignmentWorkload,
  getBoard,
  getProgress,
  getProjectHistory,
  instantiateTemplate,
  listAssignments,
  listCommentBank,
  listSourcePacks,
  listTemplates,
  markCommentBankNoteUsed,
  markNotebookWritten,
  myProject,
  myProjectById,
  myWriting,
  overrideProjectStage,
  previewBulkPublish,
  previewFeedbackEmail,
  previewWordSupport,
  publishAssessment,
  recordNotebookReview,
  regenerateNote,
  reportPasteAttempt,
  resendFeedbackEmail,
  retryBatchRun,
  returnDraftToStudent,
  saveAssessmentEdits,
  saveAsTemplate,
  saveCommentBankNote,
  startBatchAssessment,
  submitProject,
  testWritingAi,
  updateAssignment,
  updateSourcePack,
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
import { sourcePacksEnabled } from "../services/writingSourcePackService.js";
import { teacherToolsEnabled } from "../services/writingFlags.js";

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
router.use(requireFeature("writingAssistant"));

const staff = authorize("teacher", "admin", "super_admin");

// Lesson facts are an opt-in rollout. A 404 is the honest answer while the
// feature is off: the client hides the whole panel and offers no create button.
const requireSourcePacks = (req, res, next) => {
  if (!sourcePacksEnabled()) {
    return res.status(404).json({
      success: false,
      message: "Lesson facts packs are not enabled for this school.",
    });
  }
  next();
};

// Phase 5 teacher tools are an opt-in rollout, like lesson facts. A 404 while
// the flag is off keeps the client's feature detection honest.
const requireTeacherTools = (req, res, next) => {
  if (!teacherToolsEnabled()) {
    return res.status(404).json({
      success: false,
      message: "These writing tools are not enabled for this school yet.",
    });
  }
  next();
};

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

/* Teacher: lesson facts library, reused across assignments (opt-in rollout) */
router.get("/source-packs", staff, requireSourcePacks, listSourcePacks);
router.post("/source-packs", staff, requireSourcePacks, createSourcePack);
router.patch(
  "/source-packs/:packId",
  staff,
  requireSourcePacks,
  updateSourcePack,
);

/* Teacher: progress and history */
router.get("/assignments/:assignmentId/board", staff, getBoard);
router.get("/assignments/:assignmentId/progress", staff, getProgress);
// F9/F11: read-only summaries computed from stored rows; no AI, no ranking.
router.get(
  "/assignments/:assignmentId/insight",
  staff,
  requireTeacherTools,
  getAssignmentInsight,
);
router.get(
  "/assignments/:assignmentId/workload",
  staff,
  requireTeacherTools,
  getAssignmentWorkload,
);
// I12: a staff-only provider check for configuration problems. The fixed prompt
// carries no draft, nothing is stored, and the call never touches AI credit.
router.post(
  "/ai-self-test",
  staff,
  requireTeacherTools,
  aiFeatureRateLimiter,
  testWritingAi,
);
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
// F3: the queued batch. Starting returns a run id; progress is polled below.
router.post(
  "/assignments/:assignmentId/batch-assess",
  staff,
  requireTeacherTools,
  aiFeatureRateLimiter,
  startBatchAssessment,
);
router.get("/batch-runs/:batchRunId", staff, requireTeacherTools, getBatchRun);
router.post(
  "/batch-runs/:batchRunId/cancel",
  staff,
  requireTeacherTools,
  cancelBatchRun,
);
router.post(
  "/batch-runs/:batchRunId/retry",
  staff,
  requireTeacherTools,
  retryBatchRun,
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
// F1: one note rewritten in place; the rest of the assessment never moves.
router.post(
  "/assessments/:assessmentId/notes/rewrite",
  staff,
  requireTeacherTools,
  aiFeatureRateLimiter,
  regenerateNote,
);
// The unused lesson facts behind one assessed section, for the evidence panel.
router.get(
  "/assessments/:assessmentId/evidence-facts",
  staff,
  requireSourcePacks,
  assessmentEvidenceFacts,
);
// Publishing can send a family email, so it goes through the same send limiter
// as resend rather than being an unmetered second way to mail a guardian.
router.post(
  "/assessments/:assessmentId/publish",
  staff,
  emailSendRateLimiter,
  publishAssessment,
);
// F7: the class-wide publish. The preview is free; publishing takes the same
// send limiter as a single publish because it can mail every family at once.
router.post(
  "/assignments/:assignmentId/bulk-publish/preview",
  staff,
  requireTeacherTools,
  previewBulkPublish,
);
router.post(
  "/assignments/:assignmentId/bulk-publish",
  staff,
  requireTeacherTools,
  emailSendRateLimiter,
  bulkPublish,
);
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
// F13: a submission sent by mistake goes back to the editor untouched.
router.post("/projects/:projectId/return", staff, returnDraftToStudent);

/* Teacher: the reusable comment bank (F2, flag-gated, no AI, no billing) */
router.get("/comment-bank", staff, requireTeacherTools, listCommentBank);
router.post("/comment-bank", staff, requireTeacherTools, saveCommentBankNote);
router.post(
  "/comment-bank/:commentId/used",
  staff,
  requireTeacherTools,
  markCommentBankNoteUsed,
);
router.delete(
  "/comment-bank/:commentId",
  staff,
  requireTeacherTools,
  deleteCommentBankNote,
);

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
