import { asyncHandler } from '../middleware/errorHandler.js';
import {
  getEditImpact,
  applyMetadataEdit,
  createRevision,
  publishRevision,
  getRevisionHistory,
} from '../services/assessmentRevisionService.js';
import logger from '../utils/logger.js';

/**
 * GET /api/standard-assessment/:id/edit-impact
 * Get the impact preview of editing a live assessment.
 */
export const getAssessmentEditImpact = asyncHandler(async (req, res) => {
  const result = await getEditImpact(req.schoolId, req.params.id);
  return res.json({ success: true, data: result });
});

/**
 * PATCH /api/standard-assessment/:id
 * Apply a metadata-only edit to an assignment.
 */
export const patchAssessment = asyncHandler(async (req, res) => {
  const { title, instructions, dueDate } = req.body;

  const result = await applyMetadataEdit(
    req.schoolId,
    req.params.id,
    req.user._id,
    { title, instructions, dueDate },
    req.ip
  );

  return res.json({ success: true, data: result });
});

/**
 * POST /api/standard-assessment/:id/revisions
 * Create a new content revision for a live assessment.
 */
export const createAssessmentRevision = asyncHandler(async (req, res) => {
  const { contentSnapshot, changeSummary, changeType, revisionPolicy } = req.body;

  if (!contentSnapshot) {
    return res.status(400).json({
      success: false,
      message: 'contentSnapshot is required.',
    });
  }

  const result = await createRevision({
    schoolId: req.schoolId,
    userId: req.user._id,
    assignmentId: req.params.id,
    contentSnapshot,
    changeSummary,
    changeType,
    revisionPolicy,
  });

  return res.status(201).json({ success: true, data: result });
});

/**
 * POST /api/standard-assessment/:id/revisions/:version/publish
 * Publish a revision.
 */
export const publishAssessmentRevision = asyncHandler(async (req, res) => {
  const result = await publishRevision({
    schoolId: req.schoolId,
    userId: req.user._id,
    assignmentId: req.params.id,
    versionNumber: parseInt(req.params.version),
    ipAddress: req.ip,
  });

  return res.json({ success: true, data: result });
});

/**
 * GET /api/standard-assessment/:id/revisions
 * Get the revision history for an assignment.
 */
export const getAssessmentRevisions = asyncHandler(async (req, res) => {
  const revisions = await getRevisionHistory(req.schoolId, req.params.id);
  return res.json({ success: true, data: { revisions } });
});
