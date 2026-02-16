import express from "express";
import { protect, authorize } from "../middleware/auth.js";
import { requireSchoolContext } from "../middleware/tenantIsolation.js";
import {
  ensureNewsletterIssue,
  getNewsletterIssue,
  generateNewsletterSectionDraft,
  submitNewsletterSection,
  listAdminIssues,
  getAdminIssueDetails,
  approveNewsletterSection,
  rejectNewsletterSection,
  updateIssueExclusions,
  sendIssueToParents,
} from "../controllers/newsletterController.js";

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);

// Teacher/Admin/Department Principal shared
router.post("/issues/ensure", authorize("teacher", "admin", "department_principal"), ensureNewsletterIssue);
router.get("/issues", authorize("teacher", "admin", "department_principal"), getNewsletterIssue);

// Teacher actions
router.post("/sections/generate", authorize("teacher"), generateNewsletterSectionDraft);
router.post("/sections/:id/submit", authorize("teacher"), submitNewsletterSection);

// Admin/Department Principal actions
router.get("/admin/issues", authorize("admin", "super_admin", "department_principal"), listAdminIssues);
router.get("/admin/issues/:id", authorize("admin", "super_admin", "department_principal"), getAdminIssueDetails);
router.post("/admin/sections/:id/approve", authorize("admin", "super_admin"), approveNewsletterSection);
router.post("/admin/sections/:id/reject", authorize("admin", "super_admin"), rejectNewsletterSection);
router.patch("/admin/issues/:id/exclusions", authorize("admin", "super_admin"), updateIssueExclusions);
router.post("/admin/issues/:id/send", authorize("admin", "super_admin"), sendIssueToParents);

export default router;

