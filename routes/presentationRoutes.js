import express from "express";
import { protect, authorize, requirePermission } from "../middleware/auth.js";
import { requireFeature } from "../middleware/featureGate.js";
import { requireSchoolContext } from "../middleware/tenantIsolation.js";
import { validate } from "../middleware/validator.js";
import { uploadPresentation } from "../middleware/upload.js";
import { presentationValidators } from "../validators/presentationValidators.js";
import { PERMISSIONS } from "../config/permissions.js";
import {
  uploadMaterials,
  generatePresentation,
  getPresentation,
  listPresentations,
  updatePresentation,
  updateSlide,
  regenerateSlide,
  reorderSlides,
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
  uploadPresentation.array("files", 5),
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

router.post(
  "/:id/slides/:slideIndex/regenerate",
  authorize("teacher", "admin", "department_principal"),
  requirePermission(PERMISSIONS.MANAGE_PRESENTATIONS),
  presentationValidators.mongoId,
  presentationValidators.regenerateSlide,
  validate,
  regenerateSlide
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

// ─── Export ─────────────────────────────────────────────────────────────────
router.get(
  "/:id/export/pdf",
  authorize("teacher", "admin", "department_principal"),
  presentationValidators.mongoId,
  validate,
  exportPdf
);

export default router;
