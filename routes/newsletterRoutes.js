import express from "express";
import { protect, authorize } from "../middleware/auth.js";
import { requireFeature } from "../middleware/featureGate.js";
import { requireSchoolContext } from "../middleware/tenantIsolation.js";
import { aiFeatureRateLimiter, emailSendRateLimiter } from "../middleware/rateLimiters.js";
import {
  ensureNewsletterIssue,
  getNewsletterIssue,
  generateNewsletterSectionDraft,
  submitNewsletterSection,
  updateNewsletterSectionContent,
  listAdminIssues,
  listAdminSentIssues,
  getAdminIssueDetails,
  previewIssueEmail,
  approveNewsletterSection,
  approveAllSubmittedSectionsForIssue,
  approveAllSubmittedSectionsForWeek,
  listParentNewsletterHistory,
  rejectNewsletterSection,
  updateIssueExclusions,
  sendIssueToParents,
} from "../controllers/newsletterController.js";

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
router.use(requireFeature("newsletterCommunication"));

// Teacher/Admin shared
router.post("/issues/ensure", authorize("teacher", "admin", "department_principal"), ensureNewsletterIssue);
router.get("/issues", authorize("teacher", "admin", "department_principal"), getNewsletterIssue);
router.get("/parent/history", authorize("parent"), listParentNewsletterHistory);

// Teacher actions
router.post("/sections/generate", authorize("teacher"), aiFeatureRateLimiter, generateNewsletterSectionDraft);
router.post("/sections/:id/submit", authorize("teacher"), submitNewsletterSection);
router.patch(
  "/sections/:id/content",
  authorize("teacher", "admin", "super_admin", "department_principal"),
  updateNewsletterSectionContent
);

// Admin actions
router.get("/admin/issues", authorize("admin", "super_admin", "department_principal"), listAdminIssues);
router.get("/admin/sent", authorize("admin", "super_admin", "department_principal"), listAdminSentIssues);
router.post(
  "/admin/issues/approve-submitted",
  authorize("admin", "super_admin", "department_principal"),
  approveAllSubmittedSectionsForWeek
);
router.get("/admin/issues/:id", authorize("admin", "super_admin", "department_principal"), getAdminIssueDetails);
router.get("/admin/issues/:id/preview", authorize("admin", "super_admin", "department_principal"), previewIssueEmail);
router.post(
  "/admin/issues/:id/approve-submitted",
  authorize("admin", "super_admin", "department_principal"),
  approveAllSubmittedSectionsForIssue
);
router.post("/admin/sections/:id/approve", authorize("admin", "super_admin", "department_principal"), approveNewsletterSection);
router.post("/admin/sections/:id/reject", authorize("admin", "super_admin", "department_principal"), rejectNewsletterSection);
router.patch("/admin/issues/:id/exclusions", authorize("admin", "super_admin", "department_principal"), updateIssueExclusions);
router.post("/admin/issues/:id/send", authorize("admin", "super_admin", "department_principal"), emailSendRateLimiter, sendIssueToParents);

export default router;
