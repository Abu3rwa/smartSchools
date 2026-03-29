import express from "express";
import { protect, authorize } from "../middleware/auth.js";
import { requireFeature } from "../middleware/featureGate.js";
import { requireSchoolContext } from "../middleware/tenantIsolation.js";
import {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  duplicateTemplate,
  setDefaultTemplate,
  getActiveDefault,
  uploadTemplateImage,
} from "../controllers/newsletterTemplateController.js";
import upload from "../middleware/upload.js";

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
router.use(requireFeature("newsletterCommunication"));

// Public-ish reads (any authenticated school user who has the feature)
router.get("/active-default", getActiveDefault);
router.post(
  "/upload-image",
  authorize("admin", "super_admin"),
  upload.single("image"),
  uploadTemplateImage,
);

// Admin / permitted-user management routes
router.get("/", authorize("admin", "super_admin", "department_principal"), listTemplates);
router.get("/:id", authorize("admin", "super_admin", "department_principal"), getTemplate);
router.post("/", authorize("admin", "super_admin"), createTemplate);
router.put("/:id", authorize("admin", "super_admin"), updateTemplate);
router.delete("/:id", authorize("admin", "super_admin"), deleteTemplate);
router.post("/:id/duplicate", authorize("admin", "super_admin"), duplicateTemplate);
router.patch("/:id/set-default", authorize("admin", "super_admin"), setDefaultTemplate);

export default router;
