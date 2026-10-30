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
import {
  generateChildLetters,
  listChildLetters,
  listChildLetterStudents,
  updateChildLetterContent,
  submitChildLetter,
  reviewChildLetter,
  approveSubmittedChildLetters,
  sendChildLetters,
  previewChildLetter,
  downloadChildLetterPdf,
  listParentChildLetters,
  getParentChildLetter,
  downloadParentChildLetterPdf,
} from "../controllers/newsletterChildLetterController.js";

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
router.use(requireFeature("newsletterCommunication"));

// Teacher/Admin shared
router.post("/issues/ensure", authorize("teacher", "admin", "department_principal"), ensureNewsletterIssue);
router.get("/issues", authorize("teacher", "admin", "department_principal"), getNewsletterIssue);
router.get("/parent/history", authorize("parent"), listParentNewsletterHistory);
router.get("/parent/child-letters", authorize("parent"), listParentChildLetters);
router.get("/parent/child-letters/:id", authorize("parent"), getParentChildLetter);
router.get("/parent/child-letters/:id/pdf", authorize("parent"), downloadParentChildLetterPdf);

// Teacher actions
router.post("/sections/generate", authorize("teacher"), aiFeatureRateLimiter, generateNewsletterSectionDraft);
router.post("/sections/:id/submit", authorize("teacher"), submitNewsletterSection);
router.patch(
  "/sections/:id/content",
  authorize("teacher", "admin", "super_admin", "department_principal"),
  updateNewsletterSectionContent
);

// Per-child letters (the default newsletter mode)
router.post("/child-letters/generate", authorize("teacher"), aiFeatureRateLimiter, generateChildLetters);
router.get(
  "/child-letters/students",
  authorize("teacher", "admin", "super_admin", "department_principal"),
  listChildLetterStudents
);
router.get(
  "/child-letters",
  authorize("teacher", "admin", "super_admin", "department_principal"),
  listChildLetters
);
router.get(
  "/child-letters/:id/preview",
  authorize("teacher", "admin", "super_admin", "department_principal"),
  previewChildLetter
);
router.get(
  "/child-letters/:id/pdf",
  authorize("teacher", "admin", "super_admin", "department_principal"),
  downloadChildLetterPdf
);
router.patch(
  "/child-letters/:id/content",
  authorize("teacher", "admin", "super_admin", "department_principal"),
  updateChildLetterContent
);
router.post("/child-letters/:id/submit", authorize("teacher"), submitChildLetter);

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
router.post(
  "/admin/child-letters/:id/review",
  authorize("admin", "super_admin", "department_principal"),
  reviewChildLetter
);
router.post(
  "/admin/issues/:id/child-letters/approve-submitted",
  authorize("admin", "super_admin", "department_principal"),
  approveSubmittedChildLetters
);
router.post(
  "/admin/issues/:id/child-letters/send",
  authorize("admin", "super_admin", "department_principal"),
  emailSendRateLimiter,
  sendChildLetters
);

export default router;
