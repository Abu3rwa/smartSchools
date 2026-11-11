import { asyncHandler } from "../middleware/errorHandler.js";
import * as analysisService from "../services/writingAnalysisService.js";

const isAdminUser = (user) =>
  ["admin", "super_admin"].includes(String(user?.role || ""));

/**
 * Everything before a run: eligible pieces, exclusion reasons, standards and a
 * priced estimate. Read-only; no AI call.
 */
export const getAnalysisScope = asyncHandler(async (req, res) => {
  const data = await analysisService.getAnalysisScope({
    schoolId: req.schoolId,
    projectId: req.query.projectId,
    classId: req.query.classId,
    studentId: req.query.studentId,
    userId: req.user._id,
    isAdmin: isAdminUser(req.user),
    subjectId: req.query.subjectId,
    from: req.query.from,
    to: req.query.to,
    language: req.query.language,
    standardCount: req.query.standardCount,
    draftIds: req.query.draftIds,
  });
  res.json({ success: true, data });
});

/** Starts a run. The AI work continues in the background; the id is polled. */
export const createAnalysis = asyncHandler(async (req, res) => {
  const data = await analysisService.createAnalysis({
    schoolId: req.schoolId,
    projectId: req.body?.projectId,
    classId: req.body?.classId,
    studentId: req.body?.studentId,
    userId: req.user._id,
    isAdmin: isAdminUser(req.user),
    subjectId: req.body?.subjectId,
    standardIds: req.body?.standardIds,
    draftIds: req.body?.draftIds,
    from: req.body?.from,
    to: req.body?.to,
    language: req.body?.language,
  });
  res.status(202).json({ success: true, data });
});

export const getAnalysis = asyncHandler(async (req, res) => {
  const data = await analysisService.getAnalysis({
    schoolId: req.schoolId,
    analysisId: req.params.analysisId,
    userId: req.user._id,
    isAdmin: isAdminUser(req.user),
  });
  res.json({ success: true, data });
});

export const listAnalyses = asyncHandler(async (req, res) => {
  const data = await analysisService.listAnalyses({
    schoolId: req.schoolId,
    studentId: req.query.studentId,
    classId: req.query.classId,
    userId: req.user._id,
    isAdmin: isAdminUser(req.user),
  });
  res.json({ success: true, data });
});

export const updateAnalysis = asyncHandler(async (req, res) => {
  const data = await analysisService.updateAnalysis({
    schoolId: req.schoolId,
    analysisId: req.params.analysisId,
    userId: req.user._id,
    isAdmin: isAdminUser(req.user),
    edits: req.body || {},
  });
  res.json({ success: true, data });
});

export const retryAnalysis = asyncHandler(async (req, res) => {
  const data = await analysisService.runAnalysis({
    schoolId: req.schoolId,
    analysisId: req.params.analysisId,
    userId: req.user._id,
    onlyFailed: true,
  });
  res.status(202).json({ success: true, data });
});

export const publishAnalysis = asyncHandler(async (req, res) => {
  const data = await analysisService.publishAnalysis({
    schoolId: req.schoolId,
    analysisId: req.params.analysisId,
    userId: req.user._id,
    isAdmin: isAdminUser(req.user),
    confirmOverwrite: req.body?.confirmOverwrite === true,
    createMissingColumns: req.body?.createMissingColumns === true,
  });
  res.json({ success: true, data });
});

/** What a publish would change, before anything is written. */
export const getPublishPreview = asyncHandler(async (req, res) => {
  const data = await analysisService.getPublishPreview({
    schoolId: req.schoolId,
    analysisId: req.params.analysisId,
    userId: req.user._id,
    isAdmin: isAdminUser(req.user),
  });
  res.json({ success: true, data });
});
