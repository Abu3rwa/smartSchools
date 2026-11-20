import { asyncHandler } from "../middleware/errorHandler.js";
import Student from "../models/Student.js";
import { resolveAcademicYearForRequest } from "../helpers/academicYearScope.js";
import * as writingService from "../services/writingAssistantService.js";
import * as writingAssessmentService from "../services/writingAssistantAssessmentService.js";
import * as writingSourcePackService from "../services/writingSourcePackService.js";
import * as writingCommentBankService from "../services/writingCommentBankService.js";
import * as writingBatchRunService from "../services/writingBatchRunService.js";
import * as writingBulkPublishService from "../services/writingBulkPublishService.js";
import * as writingClassInsightService from "../services/writingClassInsightService.js";
import * as writingAiSelfTestService from "../services/writingAiSelfTestService.js";
import { teacherToolsEnabled } from "../services/writingFlags.js";
import {
  emailChannels,
  previewPublishedFeedbackEmail,
  resendPublishedFeedbackEmail,
} from "../services/writingFeedbackEmailService.js";
import { getCreditBadge } from "../services/aiCreditService.js";
import { renderWritingProjectHtml } from "../services/writingDraftReportService.js";
import { sendPrintableHtml, withPrintPageCss } from "../utils/printableHtml.js";

const studentForRequest = async (req) => {
  const academicYear = resolveAcademicYearForRequest(req);
  const student = await Student.findOne({
    school: req.schoolId,
    user: req.user._id,
    academicYear,
  })
    .select("_id currentClass")
    .lean();
  if (!student) {
    throw Object.assign(
      new Error(`No student record for this sign-in in ${academicYear}`),
      { statusCode: 404 },
    );
  }
  return student;
};

const isAdminUser = (user) =>
  ["admin", "super_admin"].includes(String(user?.role || ""));

const sendWritingSheet = (res, html) =>
  sendPrintableHtml(
    res,
    withPrintPageCss(html, { margin: "18mm 16mm" }),
    { filename: "writing-draft.html" },
  );

/* ------------------------------------------------------------------ */
/* Teacher                                                             */
/* ------------------------------------------------------------------ */

export const createAssignment = asyncHandler(async (req, res) => {
  const assignment = await writingService.createAssignment({
    schoolId: req.schoolId,
    academicYear: resolveAcademicYearForRequest(req),
    userId: req.user._id,
    isAdmin: isAdminUser(req.user),
    payload: req.body || {},
  });
  res.status(201).json({ success: true, data: assignment });
});

export const listAssignments = asyncHandler(async (req, res) => {
  const assignments = await writingService.listAssignments({
    schoolId: req.schoolId,
    userId: req.user._id,
    isAdmin: isAdminUser(req.user),
    classId: req.query.classId,
    academicYear: resolveAcademicYearForRequest(req),
    search: req.query.search,
  });
  res.json({ success: true, data: assignments });
});

export const getAssignment = asyncHandler(async (req, res) => {
  const assignment = await writingService.getAssignmentForTeacher({
    schoolId: req.schoolId,
    assignmentId: req.params.assignmentId,
    userId: req.user._id,
    isAdmin: isAdminUser(req.user),
  });
  res.json({ success: true, data: assignment });
});

export const updateAssignment = asyncHandler(async (req, res) => {
  const assignment = await writingService.updateAssignment({
    schoolId: req.schoolId,
    assignmentId: req.params.assignmentId,
    userId: req.user._id,
    isAdmin: isAdminUser(req.user),
    payload: req.body || {},
  });
  res.json({ success: true, data: assignment });
});

export const deactivateAssignment = asyncHandler(async (req, res) => {
  const result = await writingService.deactivateAssignment({
    schoolId: req.schoolId,
    assignmentId: req.params.assignmentId,
    userId: req.user._id,
    isAdmin: isAdminUser(req.user),
    confirmed: req.body?.confirmed === true,
  });
  res.json({ success: true, data: result });
});

export const previewWordSupport = asyncHandler(async (req, res) => {
  const data = await writingService.previewWordSupport({
    schoolId: req.schoolId,
    assignmentId: req.params.assignmentId,
    userId: req.user._id,
    isAdmin: isAdminUser(req.user),
    studentId: req.body?.studentId,
    wordSupport: req.body?.wordSupport,
  });
  res.json({ success: true, data });
});

/* ------------------------------------------------------------------ */
/* Teacher: lesson facts packs (school library)                        */
/* ------------------------------------------------------------------ */

export const listSourcePacks = asyncHandler(async (req, res) => {
  const packs = await writingSourcePackService.listSourcePacks({
    schoolId: req.schoolId,
  });
  res.json({ success: true, data: packs });
});

export const createSourcePack = asyncHandler(async (req, res) => {
  const pack = await writingSourcePackService.createSourcePack({
    schoolId: req.schoolId,
    userId: req.user._id,
    payload: req.body || {},
  });
  res.status(201).json({ success: true, data: pack });
});

export const updateSourcePack = asyncHandler(async (req, res) => {
  const pack = await writingSourcePackService.updateSourcePack({
    schoolId: req.schoolId,
    packId: req.params.packId,
    userId: req.user._id,
    payload: req.body || {},
  });
  res.json({ success: true, data: pack });
});

export const assessmentEvidenceFacts = asyncHandler(async (req, res) => {
  const data = await writingSourcePackService.evidenceFactsForAssessment({
    schoolId: req.schoolId,
    assessmentId: req.params.assessmentId,
    sectionKey: String(req.query.key || ""),
    index: Number(req.query.index) || 0,
    userId: req.user._id,
    isAdmin: isAdminUser(req.user),
  });
  res.json({ success: true, data });
});

export const saveAsTemplate = asyncHandler(async (req, res) => {
  const template = await writingService.saveAsTemplate({
    schoolId: req.schoolId,
    assignmentId: req.params.assignmentId,
    userId: req.user._id,
    isAdmin: isAdminUser(req.user),
  });
  res.status(201).json({ success: true, data: template });
});

export const listTemplates = asyncHandler(async (req, res) => {
  const templates = await writingService.listAssignments({
    schoolId: req.schoolId,
    userId: req.user._id,
    isAdmin: isAdminUser(req.user),
    includeTemplates: true,
  });
  res.json({ success: true, data: templates.filter((row) => row.isTemplate) });
});

export const instantiateTemplate = asyncHandler(async (req, res) => {
  const assignment = await writingService.instantiateTemplate({
    schoolId: req.schoolId,
    templateId: req.params.templateId,
    userId: req.user._id,
    isAdmin: isAdminUser(req.user),
    academicYear: resolveAcademicYearForRequest(req),
    payload: req.body || {},
  });
  res.status(201).json({ success: true, data: assignment });
});

export const getBoard = asyncHandler(async (req, res) => {
  const [board, credit, batchRun] = await Promise.all([
    writingService.getTeacherBoard({
      schoolId: req.schoolId,
      assignmentId: req.params.assignmentId,
      classId: req.query.classId,
      userId: req.user._id,
      isAdmin: isAdminUser(req.user),
    }),
    getCreditBadge({ schoolId: req.schoolId, userId: req.user._id }),
    teacherToolsEnabled()
      ? writingBatchRunService.latestBatchRun({
          schoolId: req.schoolId,
          assignmentId: req.params.assignmentId,
          userId: req.user._id,
          isAdmin: isAdminUser(req.user),
        })
      : null,
  ]);
  res.json({
    success: true,
    data: {
      ...board,
      emailDelivery: emailChannels(),
      credit,
      batchRun,
      // Phase 5 screens are flag-gated; the UI reads the server's answer
      // instead of assuming a deployment setting.
      features: { teacherTools: teacherToolsEnabled() },
    },
  });
});

export const getProgress = asyncHandler(async (req, res) => {
  const progress = await writingService.getClassProgress({
    schoolId: req.schoolId,
    assignmentId: req.params.assignmentId,
    userId: req.user._id,
    isAdmin: isAdminUser(req.user),
  });
  res.json({ success: true, data: progress });
});

export const getAssignmentInsight = asyncHandler(async (req, res) => {
  const insight = await writingClassInsightService.assignmentInsight({
    schoolId: req.schoolId,
    assignmentId: req.params.assignmentId,
    classId: req.query.classId,
    userId: req.user._id,
    isAdmin: isAdminUser(req.user),
  });
  res.json({ success: true, data: insight });
});

export const getAssignmentWorkload = asyncHandler(async (req, res) => {
  const workload = await writingClassInsightService.assignmentWorkload({
    schoolId: req.schoolId,
    assignmentId: req.params.assignmentId,
    userId: req.user._id,
    isAdmin: isAdminUser(req.user),
  });
  res.json({ success: true, data: workload });
});

/** I12: the staff-only writing AI self-test. Costs no credit and stores nothing. */
export const testWritingAi = asyncHandler(async (req, res) => {
  const result = await writingAiSelfTestService.testWritingAi();
  res.json({ success: true, data: result });
});

export const printProjectForTeacher = asyncHandler(async (req, res) => {
  await writingService.assertProjectVisibleToTeacher({
    schoolId: req.schoolId,
    projectId: req.params.projectId,
    userId: req.user._id,
    isAdmin: isAdminUser(req.user),
  });
  const html = await renderWritingProjectHtml({
    schoolId: req.schoolId,
    projectId: req.params.projectId,
    draftId: req.query.draft || null,
    publishedOnly: false,
    includeWordUse: true,
  });
  sendWritingSheet(res, html);
});

export const getProjectHistory = asyncHandler(async (req, res) => {
  // The review screen publishes from here, so it needs the same recipient
  // channels and credit badge the board returns — one request, not two.
  const [history, credit] = await Promise.all([
    writingService.getProjectHistory({
      schoolId: req.schoolId,
      projectId: req.params.projectId,
      userId: req.user._id,
      isAdmin: isAdminUser(req.user),
    }),
    getCreditBadge({ schoolId: req.schoolId, userId: req.user._id }),
  ]);
  res.json({
    success: true,
    data: { ...history, emailDelivery: emailChannels(), credit },
  });
});

/* Teacher: assessment and publication */

export const assessDraft = asyncHandler(async (req, res) => {
  const result = await writingAssessmentService.assessDraft({
    schoolId: req.schoolId,
    draftId: req.params.draftId,
    userId: req.user._id,
    isAdmin: isAdminUser(req.user),
    language: req.body?.language || req.query.language,
    // A finished run costs credit again; only an explicit re-assess sends this.
    force: req.body?.force === true,
    // K6: the teacher UI asks for the detached form so a slow provider never
    // holds the request past the proxy timeout; the stored row reports the rest.
    detached: req.body?.async === true,
  });
  res.status(result.pending ? 202 : 201).json({ success: true, data: result });
});

export const assessAssignment = asyncHandler(async (req, res) => {
  const result = await writingAssessmentService.assessPendingBatch({
    schoolId: req.schoolId,
    assignmentId: req.params.assignmentId,
    userId: req.user._id,
    isAdmin: isAdminUser(req.user),
    classId: req.body?.classId || req.query.classId,
    limit: req.body?.limit,
    language: req.body?.language || req.query.language,
  });
  res.json({ success: true, data: result });
});

// F3: the same batch work, but as a run the teacher can watch and resume.
export const startBatchAssessment = asyncHandler(async (req, res) => {
  const result = await writingBatchRunService.startBatch({
    schoolId: req.schoolId,
    assignmentId: req.params.assignmentId,
    userId: req.user._id,
    isAdmin: isAdminUser(req.user),
    classId: req.body?.classId || req.query.classId,
    limit: req.body?.limit,
    language: req.body?.language || req.query.language,
    confirm: req.body?.confirm === true,
  });
  res.status(result.started ? 201 : 200).json({ success: true, data: result });
});

export const getBatchRun = asyncHandler(async (req, res) => {
  const result = await writingBatchRunService.getBatchRun({
    schoolId: req.schoolId,
    userId: req.user._id,
    isAdmin: isAdminUser(req.user),
    batchRunId: req.params.batchRunId,
  });
  res.json({ success: true, data: result });
});

export const cancelBatchRun = asyncHandler(async (req, res) => {
  const result = await writingBatchRunService.cancelBatchRun({
    schoolId: req.schoolId,
    userId: req.user._id,
    isAdmin: isAdminUser(req.user),
    batchRunId: req.params.batchRunId,
  });
  res.json({ success: true, data: result });
});

export const retryBatchRun = asyncHandler(async (req, res) => {
  const result = await writingBatchRunService.retryBatchRun({
    schoolId: req.schoolId,
    userId: req.user._id,
    isAdmin: isAdminUser(req.user),
    batchRunId: req.params.batchRunId,
  });
  res.json({ success: true, data: result });
});

export const compareDraft = asyncHandler(async (req, res) => {
  const result = await writingAssessmentService.compareDrafts({
    schoolId: req.schoolId,
    draftId: req.params.draftId,
    userId: req.user._id,
    isAdmin: isAdminUser(req.user),
    language: req.body?.language || req.query.language,
    force: req.body?.force === true,
  });
  res.status(201).json({ success: true, data: result });
});

export const saveAssessmentEdits = asyncHandler(async (req, res) => {
  const result = await writingAssessmentService.saveAssessmentEdits({
    schoolId: req.schoolId,
    assessmentId: req.params.assessmentId,
    userId: req.user._id,
    isAdmin: isAdminUser(req.user),
    payload: req.body || {},
  });
  res.json({ success: true, data: result });
});

export const publishAssessment = asyncHandler(async (req, res) => {
  const result = await writingAssessmentService.publishAssessment({
    schoolId: req.schoolId,
    assessmentId: req.params.assessmentId,
    userId: req.user._id,
    isAdmin: isAdminUser(req.user),
    payload: req.body || {},
  });
  res.json({ success: true, data: result });
});

export const previewFeedbackEmail = asyncHandler(async (req, res) => {
  const result = await previewPublishedFeedbackEmail({
    schoolId: req.schoolId,
    assessmentId: req.params.assessmentId,
    userId: req.user._id,
    isAdmin: isAdminUser(req.user),
    notify: req.body?.notify,
  });
  res.set("Cache-Control", "no-store");
  res.json({ success: true, data: result });
});

// F7: a dry run before the class-wide publish. Nothing is written or mailed.
export const previewBulkPublish = asyncHandler(async (req, res) => {
  const result = await writingBulkPublishService.previewBulkPublish({
    schoolId: req.schoolId,
    assignmentId: req.params.assignmentId,
    userId: req.user._id,
    isAdmin: isAdminUser(req.user),
    projectIds: req.body?.projectIds,
    notify: req.body?.notify,
  });
  res.set("Cache-Control", "no-store");
  res.json({ success: true, data: result });
});

export const bulkPublish = asyncHandler(async (req, res) => {
  const result = await writingBulkPublishService.bulkPublish({
    schoolId: req.schoolId,
    assignmentId: req.params.assignmentId,
    userId: req.user._id,
    isAdmin: isAdminUser(req.user),
    projectIds: req.body?.projectIds,
    notify: req.body?.notify,
  });
  res.json({ success: true, data: result });
});

export const resendFeedbackEmail = asyncHandler(async (req, res) => {
  const result = await resendPublishedFeedbackEmail({
    schoolId: req.schoolId,
    assessmentId: req.params.assessmentId,
    userId: req.user._id,
    isAdmin: isAdminUser(req.user),
    notify: req.body?.notify,
  });
  res.json({ success: true, data: result });
});

export const overrideProjectStage = asyncHandler(async (req, res) => {
  const result = await writingAssessmentService.overrideStage({
    schoolId: req.schoolId,
    projectId: req.params.projectId,
    userId: req.user._id,
    isAdmin: isAdminUser(req.user),
    payload: req.body || {},
  });
  res.json({ success: true, data: result });
});

export const recordNotebookReview = asyncHandler(async (req, res) => {
  const result = await writingAssessmentService.recordNotebookReview({
    schoolId: req.schoolId,
    projectId: req.params.projectId,
    userId: req.user._id,
    isAdmin: isAdminUser(req.user),
    payload: req.body || {},
  });
  res.json({ success: true, data: result });
});

// F13: pull back a submission the student did not mean to send.
export const returnDraftToStudent = asyncHandler(async (req, res) => {
  const result = await writingAssessmentService.returnDraftToStudent({
    schoolId: req.schoolId,
    projectId: req.params.projectId,
    userId: req.user._id,
    isAdmin: isAdminUser(req.user),
    payload: req.body || {},
  });
  res.json({ success: true, data: result });
});

// F1: rewrite one note; the reply replaces only that note in the editor.
export const regenerateNote = asyncHandler(async (req, res) => {
  const result = await writingAssessmentService.regenerateNote({
    schoolId: req.schoolId,
    assessmentId: req.params.assessmentId,
    userId: req.user._id,
    isAdmin: isAdminUser(req.user),
    payload: req.body || {},
  });
  res.json({ success: true, data: result });
});

// F2: the teacher's own library of reusable notes.
const criteriaFromQuery = (value) =>
  (Array.isArray(value) ? value : [value])
    .flatMap((entry) => String(entry || "").split(","))
    .map((entry) => entry.trim())
    .filter(Boolean);

export const listCommentBank = asyncHandler(async (req, res) => {
  const result = await writingCommentBankService.listComments({
    schoolId: req.schoolId,
    userId: req.user._id,
    sectionKey: req.query.sectionKey || "",
    criteria: criteriaFromQuery(req.query.criteria),
    skill: req.query.skill || "",
  });
  res.json({ success: true, data: result });
});

export const saveCommentBankNote = asyncHandler(async (req, res) => {
  const result = await writingCommentBankService.saveComment({
    schoolId: req.schoolId,
    userId: req.user._id,
    payload: req.body || {},
  });
  res.status(result.created ? 201 : 200).json({ success: true, data: result });
});

export const deleteCommentBankNote = asyncHandler(async (req, res) => {
  const result = await writingCommentBankService.deleteComment({
    schoolId: req.schoolId,
    userId: req.user._id,
    commentId: req.params.commentId,
  });
  res.json({ success: true, data: result });
});

export const markCommentBankNoteUsed = asyncHandler(async (req, res) => {
  const result = await writingCommentBankService.markCommentUsed({
    schoolId: req.schoolId,
    userId: req.user._id,
    commentId: req.params.commentId,
  });
  res.json({ success: true, data: result });
});

/* ------------------------------------------------------------------ */
/* Student — no AI is reachable from any of these                      */
/* ------------------------------------------------------------------ */

export const myWriting = asyncHandler(async (req, res) => {
  const student = await studentForRequest(req);
  const feed = await writingService.getStudentFeed({
    schoolId: req.schoolId,
    studentId: student._id,
    academicYear: resolveAcademicYearForRequest(req),
  });
  res.json({ success: true, data: feed });
});

export const myProject = asyncHandler(async (req, res) => {
  const student = await studentForRequest(req);
  const project = await writingService.openProject({
    schoolId: req.schoolId,
    studentId: student._id,
    assignmentId: req.params.assignmentId,
    academicYear: resolveAcademicYearForRequest(req),
  });
  res.json({ success: true, data: project });
});

export const myProjectById = asyncHandler(async (req, res) => {
  const student = await studentForRequest(req);
  const project = await writingService.getStudentProject({
    schoolId: req.schoolId,
    projectId: req.params.projectId,
    studentId: student._id,
  });
  res.json({ success: true, data: project });
});

export const autosaveProject = asyncHandler(async (req, res) => {
  const student = await studentForRequest(req);
  const result = await writingService.autosaveProject({
    schoolId: req.schoolId,
    projectId: req.params.projectId,
    studentId: student._id,
    payload: req.body || {},
  });
  res.json({ success: true, data: result });
});

export const submitProject = asyncHandler(async (req, res) => {
  const student = await studentForRequest(req);
  const result = await writingService.submitDraft({
    schoolId: req.schoolId,
    projectId: req.params.projectId,
    studentId: student._id,
    payload: req.body || {},
  });
  res.status(201).json({ success: true, data: result });
});

export const reportPasteAttempt = asyncHandler(async (req, res) => {
  const student = await studentForRequest(req);
  const result = await writingService.recordPasteAttempt({
    schoolId: req.schoolId,
    projectId: req.params.projectId,
    studentId: student._id,
    payload: req.body || {},
  });
  res.status(201).json({ success: true, data: result });
});

export const markNotebookWritten = asyncHandler(async (req, res) => {
  const student = await studentForRequest(req);
  const result = await writingService.markNotebookWritten({
    schoolId: req.schoolId,
    projectId: req.params.projectId,
    studentId: student._id,
  });
  res.json({ success: true, data: result });
});

/** A student can print their own draft; only published feedback is included. */
export const printProject = asyncHandler(async (req, res) => {
  const student = await studentForRequest(req);
  const html = await renderWritingProjectHtml({
    schoolId: req.schoolId,
    projectId: req.params.projectId,
    draftId: req.query.draft || null,
    studentId: student._id,
    publishedOnly: true,
    includeWordUse: false,
  });
  sendWritingSheet(res, html);
});
