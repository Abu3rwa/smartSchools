import express from "express";
import {
  createAssignment,
  deleteAssignment,
  deleteDriveAttachment,
  draftAssignmentBrief,
  draftAssignmentQuestions,
  draftAssignmentSummary,
  getAssignmentAttachmentUrl,
  getAssignmentDetail,
  getAssignmentGradebook,
  getAssignments,
  getMyAssignmentsForStudent,
  getMyAssignmentsPaginated,
  gradeAssignment,
  publishAssignment,
  sendAssignmentReminder,
  setAssignmentStudentExcuse,
  updateAssignment,
  uploadDriveAttachments,
} from "../controllers/assignmentController.js";
import { authorize, protect, requirePermission } from "../middleware/auth.js";
import { PERMISSIONS } from "../config/permissions.js";
import { requireSchoolContext } from "../middleware/tenantIsolation.js";
import { validate, validationRules } from "../middleware/validator.js";
import {
  requireAssignmentUploadAvailability,
  uploadAssignmentAttachments,
} from "../middleware/uploadAssignmentAttachments.js";
import { uploadAssignmentDraftSource } from "../middleware/uploadAssignmentDraftSource.js";
import { aiFeatureRateLimiter } from "../middleware/rateLimiters.js";

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);

router.get(
  "/",
  authorize("teacher", "admin", "department_principal"),
  getAssignments,
);
router.get("/my", authorize("student"), getMyAssignmentsForStudent);
router.get(
  "/my-paginated",
  authorize("student"),
  getMyAssignmentsPaginated,
);

router.get(
  "/:id",
  authorize("student", "parent"),
  validationRules.mongoId,
  validate,
  getAssignmentDetail,
);

router.post(
  "/ai/draft-questions",
  authorize("teacher", "admin"),
  requirePermission(PERMISSIONS.CREATE_ASSIGNMENTS),
  aiFeatureRateLimiter,
  uploadAssignmentDraftSource,
  draftAssignmentQuestions,
);

router.post(
  "/ai/draft-summary",
  authorize("teacher", "admin"),
  requirePermission(PERMISSIONS.CREATE_ASSIGNMENTS),
  aiFeatureRateLimiter,
  uploadAssignmentDraftSource,
  draftAssignmentSummary,
);

router.post(
  "/ai/draft-brief",
  authorize("teacher", "admin"),
  requirePermission(PERMISSIONS.CREATE_ASSIGNMENTS),
  aiFeatureRateLimiter,
  uploadAssignmentDraftSource,
  draftAssignmentBrief,
);

router.post(
  "/",
  authorize("teacher", "admin"),
  requirePermission(PERMISSIONS.CREATE_ASSIGNMENTS),
  uploadAssignmentAttachments.array("attachments", 5),
  requireAssignmentUploadAvailability,
  createAssignment,
);

router.post(
  "/:id/publish",
  authorize("teacher", "admin"),
  requirePermission(PERMISSIONS.PUBLISH_ASSIGNMENTS),
  validationRules.mongoId,
  validate,
  publishAssignment,
);

router.post(
  "/:id/remind",
  authorize("teacher", "admin"),
  requirePermission(PERMISSIONS.CREATE_ASSIGNMENTS),
  validationRules.mongoId,
  validate,
  sendAssignmentReminder,
);

router.patch(
  "/:id/excused",
  authorize("teacher", "admin"),
  requirePermission(PERMISSIONS.GRADE_ASSIGNMENTS),
  validationRules.mongoId,
  validate,
  setAssignmentStudentExcuse,
);

router.put(
  "/:id",
  authorize("teacher", "admin"),
  requirePermission(PERMISSIONS.CREATE_ASSIGNMENTS),
  uploadAssignmentAttachments.array("attachments", 5),
  requireAssignmentUploadAvailability,
  validationRules.mongoId,
  validate,
  updateAssignment,
);

router.delete(
  "/:id",
  authorize("teacher", "admin"),
  requirePermission(PERMISSIONS.CREATE_ASSIGNMENTS),
  validationRules.mongoId,
  validate,
  deleteAssignment,
);

router.get(
  "/:id/gradebook",
  authorize("teacher", "admin", "department_principal"),
  validationRules.mongoId,
  validate,
  getAssignmentGradebook,
);

router.post(
  "/:id/grades",
  authorize("teacher", "admin"),
  requirePermission(PERMISSIONS.GRADE_ASSIGNMENTS),
  validationRules.mongoId,
  validate,
  gradeAssignment,
);

router.get(
  "/:id/attachments/:attachmentId/url",
  authorize("teacher", "admin", "student", "department_principal"),
  validationRules.mongoId,
  validate,
  getAssignmentAttachmentUrl,
);

router.post(
  "/:id/drive-attachments",
  authorize("teacher", "admin"),
  requirePermission(PERMISSIONS.CREATE_ASSIGNMENTS),
  validationRules.mongoId,
  validate,
  uploadAssignmentAttachments.array("files", 5),
  uploadDriveAttachments,
);

router.delete(
  "/:id/drive-attachments/:fileId",
  authorize("teacher", "admin"),
  requirePermission(PERMISSIONS.CREATE_ASSIGNMENTS),
  validationRules.mongoId,
  validate,
  deleteDriveAttachment,
);

export default router;
