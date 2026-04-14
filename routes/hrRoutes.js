import express from "express";
import { protect, requirePermission } from "../middleware/auth.js";
import { requireSchoolContext } from "../middleware/tenantIsolation.js";
import { PERMISSIONS } from "../config/permissions.js";
import {
  getHRSettings, updateHRSettings,
  getStaffProfiles, getStaffProfile, createStaffProfile, updateStaffProfile,
  getStaffDirectory, getMyProfile,
  getContracts, createContract, updateContract, terminateContract, getExpiringContracts,
  getLeaveTypes, createLeaveType, updateLeaveType, deleteLeaveType,
  getLeaveBalances, adjustLeaveBalance, bulkAllocateBalances, getMyLeaveBalances,
  getLeaveRequests, submitLeaveRequest, approveLeaveRequest, rejectLeaveRequest,
  cancelLeaveRequest, getLeaveCalendar, getMyLeaveRequests,
  getCertifications, createCertification, updateCertification, deleteCertification, getMyCertifications,
  getPDRecords, createPDRecord, updatePDRecord, deletePDRecord, getPDSummary, getMyPDRecords,
  getReviews, createReview, updateReview, submitSelfAssessment, acknowledgeReview, getMyReviews,
  getHRDashboard,
} from "../controllers/hrController.js";

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);

// ─── HR Settings ────────────────────────────────────────
router.route("/settings")
  .get(requirePermission(PERMISSIONS.MANAGE_HR_SETTINGS), getHRSettings)
  .put(requirePermission(PERMISSIONS.MANAGE_HR_SETTINGS), updateHRSettings);

// ─── Dashboard ──────────────────────────────────────────
router.get("/dashboard", requirePermission(PERMISSIONS.VIEW_STAFF_PROFILES), getHRDashboard);

// ─── Self-service (own profile) ─────────────────────────
router.get("/me/profile", requirePermission(PERMISSIONS.VIEW_OWN_HR_PROFILE), getMyProfile);
router.get("/me/leave", requirePermission(PERMISSIONS.REQUEST_LEAVE), getMyLeaveRequests);
router.get("/me/leave-balances", requirePermission(PERMISSIONS.REQUEST_LEAVE), getMyLeaveBalances);
router.get("/me/certifications", requirePermission(PERMISSIONS.VIEW_OWN_HR_PROFILE), getMyCertifications);
router.get("/me/pd", requirePermission(PERMISSIONS.LOG_PROFESSIONAL_DEVELOPMENT), getMyPDRecords);
router.get("/me/reviews", requirePermission(PERMISSIONS.VIEW_OWN_HR_PROFILE), getMyReviews);

// ─── Staff Profiles ─────────────────────────────────────
router.get("/directory", requirePermission(PERMISSIONS.VIEW_STAFF_PROFILES), getStaffDirectory);

router.route("/staff")
  .get(requirePermission(PERMISSIONS.VIEW_STAFF_PROFILES), getStaffProfiles)
  .post(requirePermission(PERMISSIONS.MANAGE_STAFF_PROFILES), createStaffProfile);

router.route("/staff/:id")
  .get(requirePermission(PERMISSIONS.VIEW_STAFF_PROFILES), getStaffProfile)
  .put(requirePermission(PERMISSIONS.MANAGE_STAFF_PROFILES), updateStaffProfile);

// ─── Contracts ──────────────────────────────────────────
router.get("/contracts/expiring", requirePermission(PERMISSIONS.VIEW_CONTRACTS), getExpiringContracts);

router.route("/contracts")
  .get(requirePermission(PERMISSIONS.VIEW_CONTRACTS), getContracts)
  .post(requirePermission(PERMISSIONS.MANAGE_CONTRACTS), createContract);

router.route("/contracts/:id")
  .put(requirePermission(PERMISSIONS.MANAGE_CONTRACTS), updateContract);

router.put("/contracts/:id/terminate", requirePermission(PERMISSIONS.MANAGE_CONTRACTS), terminateContract);

// ─── Leave Types ────────────────────────────────────────
router.route("/leave-types")
  .get(requirePermission(PERMISSIONS.VIEW_LEAVE_CALENDAR), getLeaveTypes)
  .post(requirePermission(PERMISSIONS.MANAGE_LEAVE_TYPES), createLeaveType);

router.route("/leave-types/:id")
  .put(requirePermission(PERMISSIONS.MANAGE_LEAVE_TYPES), updateLeaveType)
  .delete(requirePermission(PERMISSIONS.MANAGE_LEAVE_TYPES), deleteLeaveType);

// ─── Leave Balances ─────────────────────────────────────
router.get("/leave-balances", requirePermission(PERMISSIONS.APPROVE_LEAVE), getLeaveBalances);
router.put("/leave-balances/:id/adjust", requirePermission(PERMISSIONS.APPROVE_LEAVE), adjustLeaveBalance);
router.post("/leave-balances/allocate", requirePermission(PERMISSIONS.MANAGE_LEAVE_TYPES), bulkAllocateBalances);

// ─── Leave Requests ─────────────────────────────────────
router.get("/leave-calendar", requirePermission(PERMISSIONS.VIEW_LEAVE_CALENDAR), getLeaveCalendar);

router.route("/leave-requests")
  .get(requirePermission(PERMISSIONS.APPROVE_LEAVE), getLeaveRequests)
  .post(requirePermission(PERMISSIONS.REQUEST_LEAVE), submitLeaveRequest);

router.put("/leave-requests/:id/approve", requirePermission(PERMISSIONS.APPROVE_LEAVE), approveLeaveRequest);
router.put("/leave-requests/:id/reject", requirePermission(PERMISSIONS.APPROVE_LEAVE), rejectLeaveRequest);
router.put("/leave-requests/:id/cancel", requirePermission(PERMISSIONS.REQUEST_LEAVE), cancelLeaveRequest);

// ─── Certifications ─────────────────────────────────────
router.route("/certifications")
  .get(requirePermission(PERMISSIONS.VIEW_CERTIFICATIONS), getCertifications)
  .post(requirePermission(PERMISSIONS.MANAGE_CERTIFICATIONS), createCertification);

router.route("/certifications/:id")
  .put(requirePermission(PERMISSIONS.MANAGE_CERTIFICATIONS), updateCertification)
  .delete(requirePermission(PERMISSIONS.MANAGE_CERTIFICATIONS), deleteCertification);

// ─── Professional Development ───────────────────────────
router.get("/pd/summary", requirePermission(PERMISSIONS.VIEW_PD_REPORTS), getPDSummary);

router.route("/pd")
  .get(requirePermission(PERMISSIONS.VIEW_PD_REPORTS), getPDRecords)
  .post(requirePermission(PERMISSIONS.LOG_PROFESSIONAL_DEVELOPMENT), createPDRecord);

router.route("/pd/:id")
  .put(requirePermission(PERMISSIONS.LOG_PROFESSIONAL_DEVELOPMENT), updatePDRecord)
  .delete(requirePermission(PERMISSIONS.LOG_PROFESSIONAL_DEVELOPMENT), deletePDRecord);

// ─── Performance Reviews ────────────────────────────────
router.route("/reviews")
  .get(requirePermission(PERMISSIONS.MANAGE_PERFORMANCE_REVIEWS), getReviews)
  .post(requirePermission(PERMISSIONS.MANAGE_PERFORMANCE_REVIEWS), createReview);

router.route("/reviews/:id")
  .put(requirePermission(PERMISSIONS.MANAGE_PERFORMANCE_REVIEWS), updateReview);

router.put("/reviews/:id/self-assessment", requirePermission(PERMISSIONS.VIEW_OWN_HR_PROFILE), submitSelfAssessment);
router.put("/reviews/:id/acknowledge", requirePermission(PERMISSIONS.VIEW_OWN_HR_PROFILE), acknowledgeReview);

export default router;
