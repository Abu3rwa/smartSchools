import express from "express";
import multer from "multer";
import { protect, authorize, requirePermission } from "../middleware/auth.js";
import { requireFeature } from "../middleware/featureGate.js";
import { requireSchoolContext } from "../middleware/tenantIsolation.js";
import { validate } from "../middleware/validator.js";
import { uploadPresentation } from "../middleware/upload.js";
import { presentationValidators } from "../validators/presentationValidators.js";
import { PERMISSIONS } from "../config/permissions.js";
import { aiFeatureRateLimiter } from "../middleware/rateLimiters.js";

/** Catch multer errors and return a structured 400 response */
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const messages = {
      LIMIT_FILE_SIZE: "File too large. Maximum size is 10 MB.",
      LIMIT_FILE_COUNT: "Too many files. Maximum is 2 files per upload.",
      LIMIT_UNEXPECTED_FILE: "Unexpected file field.",
    };
    return res
      .status(400)
      .json({ success: false, message: messages[err.code] || err.message });
  }
  if (err && err.message && err.message.startsWith("Invalid file type")) {
    return res.status(400).json({ success: false, message: err.message });
  }
  next(err);
};
import {
  uploadMaterials,
  generatePresentation,
  getPresentation,
  listPresentations,
  listLayoutSystems,
  updatePresentation,
  updateSlide,
  patchSlide,
  applySlideLayout,
  regenerateSlide,
  textAssistSlide,
  reorderSlides,
  listComments,
  addComment,
  resolveComment,
  deleteComment,
  exportPdf,
  deletePresentation,
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from "../controllers/presentationController.js";

const router = express.Router();

// Apply auth, tenant, and feature gate to all routes
router.use(protect);
router.use(requireSchoolContext);
router.use(requireFeature("presentationBuilder"));

// ─── Materials upload ───────────────────────────────────────────────────────
router.post(
  "/upload",
  authorize("teacher", "admin", "department_principal"),
  requirePermission(PERMISSIONS.MANAGE_PRESENTATIONS),
  uploadPresentation.array("files", 2),
  handleMulterError,
  presentationValidators.upload,
  validate,
  uploadMaterials
);

// ─── Generation ─────────────────────────────────────────────────────────────
router.post(
  "/generate",
  authorize("teacher", "admin", "department_principal"),
  requirePermission(PERMISSIONS.MANAGE_PRESENTATIONS),
  presentationValidators.generate,
  validate,
  generatePresentation
);

router.get(
  "/layout-systems",
  authorize("teacher", "admin", "department_principal"),
  listLayoutSystems
);

// ─── Templates (must be before /:id to avoid matching "templates" as id) ───
router.get(
  "/templates",
  authorize("teacher", "admin", "department_principal"),
  listTemplates
);

router.post(
  "/templates",
  authorize("admin", "super_admin"),
  requirePermission(PERMISSIONS.MANAGE_PRESENTATION_TEMPLATES),
  presentationValidators.createTemplate,
  validate,
  createTemplate
);

router
  .route("/templates/:id")
  .put(
    authorize("admin", "super_admin"),
    requirePermission(PERMISSIONS.MANAGE_PRESENTATION_TEMPLATES),
    presentationValidators.mongoId,
    presentationValidators.updateTemplate,
    validate,
    updateTemplate
  )
  .delete(
    authorize("admin", "super_admin"),
    requirePermission(PERMISSIONS.MANAGE_PRESENTATION_TEMPLATES),
    presentationValidators.mongoId,
    validate,
    deleteTemplate
  );

// ─── CRUD ───────────────────────────────────────────────────────────────────
router.get(
  "/",
  authorize("teacher", "admin", "department_principal"),
  presentationValidators.list,
  validate,
  listPresentations
);

router
  .route("/:id")
  .get(
    authorize("teacher", "admin", "department_principal"),
    presentationValidators.mongoId,
    validate,
    getPresentation
  )
  .put(
    authorize("teacher", "admin", "department_principal"),
    requirePermission(PERMISSIONS.MANAGE_PRESENTATIONS),
    presentationValidators.mongoId,
    presentationValidators.updateMeta,
    validate,
    updatePresentation
  )
  .delete(
    authorize("teacher", "admin", "department_principal"),
    requirePermission(PERMISSIONS.MANAGE_PRESENTATIONS),
    presentationValidators.mongoId,
    validate,
    deletePresentation
  );

// ─── Slide operations ───────────────────────────────────────────────────────
router.put(
  "/:id/slides/:slideIndex",
  authorize("teacher", "admin", "department_principal"),
  requirePermission(PERMISSIONS.MANAGE_PRESENTATIONS),
  presentationValidators.mongoId,
  presentationValidators.updateSlide,
  validate,
  updateSlide
);

router.patch(
  "/:id/slides/:slideIndex/patch",
  authorize("teacher", "admin", "department_principal"),
  requirePermission(PERMISSIONS.MANAGE_PRESENTATIONS),
  presentationValidators.patchSlide,
  validate,
  patchSlide
);

router.post(
  "/:id/slides/:slideIndex/apply-layout",
  authorize("teacher", "admin", "department_principal"),
  requirePermission(PERMISSIONS.MANAGE_PRESENTATIONS),
  presentationValidators.applyLayout,
  validate,
  applySlideLayout
);

router.post(
  "/:id/slides/:slideIndex/regenerate",
  authorize("teacher", "admin", "department_principal"),
  requirePermission(PERMISSIONS.MANAGE_PRESENTATIONS),
  aiFeatureRateLimiter,
  presentationValidators.mongoId,
  presentationValidators.regenerateSlide,
  validate,
  regenerateSlide
);

router.post(
  "/:id/slides/:slideIndex/text-assist",
  authorize("teacher", "admin", "department_principal"),
  requirePermission(PERMISSIONS.MANAGE_PRESENTATIONS),
  aiFeatureRateLimiter,
  presentationValidators.textAssist,
  validate,
  textAssistSlide
);

router.put(
  "/:id/reorder",
  authorize("teacher", "admin", "department_principal"),
  requirePermission(PERMISSIONS.MANAGE_PRESENTATIONS),
  presentationValidators.mongoId,
  presentationValidators.reorder,
  validate,
  reorderSlides
);

router.get(
  "/:id/comments",
  authorize("teacher", "admin", "department_principal"),
  presentationValidators.listComments,
  validate,
  listComments
);

router.post(
  "/:id/comments",
  authorize("teacher", "admin", "department_principal"),
  presentationValidators.addComment,
  validate,
  addComment
);

router.patch(
  "/:id/comments/:commentId",
  authorize("teacher", "admin", "department_principal"),
  presentationValidators.resolveComment,
  validate,
  resolveComment
);

router.delete(
  "/:id/comments/:commentId",
  authorize("teacher", "admin", "department_principal"),
  presentationValidators.resolveComment,
  validate,
  deleteComment
);

// ─── Export ─────────────────────────────────────────────────────────────────
router.get(
  "/:id/export/pdf",
  authorize("teacher", "admin", "department_principal"),
  presentationValidators.mongoId,
  validate,
  exportPdf
);

export default router;
