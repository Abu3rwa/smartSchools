import mongoose from "mongoose";
import { tenantIsolationPlugin } from "../middleware/tenantIsolation.js";

/**
 * HR Settings — per-school configuration for the entire HR module.
 * Singleton per school (upsert pattern).
 */
const hrSettingsSchema = new mongoose.Schema(
  {
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      unique: true,
    },
    // ─── Academic Year ────────────────────────────
    currentAcademicYear: { type: String, default: "" },
    // ─── Leave Policy ─────────────────────────────
    leavePolicy: {
      yearStartMonth: { type: Number, default: 9, min: 1, max: 12 }, // Sep = academic year start
      autoAllocateOnYearStart: { type: Boolean, default: true },
      allowCarryOverGlobal: { type: Boolean, default: true },
      maxCarryOverDaysGlobal: { type: Number, default: 5 },
      weekendDays: {
        type: [String],
        default: ["fri", "sat"],
        enum: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"],
      },
      excludeHolidaysFromCount: { type: Boolean, default: true },
      minDaysForDocumentRequired: { type: Number, default: 3 }, // consecutive days trigger doc requirement
    },
    // ─── Contract Policy ──────────────────────────
    contractPolicy: {
      renewalAlertDays: { type: Number, default: 60 },
      probationDurationMonths: { type: Number, default: 3 },
      defaultWorkDays: {
        type: [String],
        default: ["sun", "mon", "tue", "wed", "thu"],
        enum: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"],
      },
      defaultHoursPerWeek: { type: Number, default: 40 },
    },
    // ─── Certification Policy ─────────────────────
    certificationPolicy: {
      expiryAlertDays: { type: Number, default: 30 },
      requiredCertifications: [
        {
          name: { type: String, trim: true },
          category: { type: String, trim: true },
          appliesTo: [{ type: String }], // staff types
        },
      ],
    },
    // ─── Performance Review Defaults ──────────────
    reviewDefaults: {
      ratingScale: { type: Number, default: 5, min: 3, max: 10 },
      defaultCategories: [
        {
          name: { type: String, trim: true },
          weight: { type: Number, default: 1 },
        },
      ],
      selfAssessmentEnabled: { type: Boolean, default: true },
      reviewCyclesPerYear: { type: Number, default: 2 },
    },
    // ─── PD Policy ────────────────────────────────
    pdPolicy: {
      requiredHoursPerYear: { type: Number, default: 0 },
      requireApproval: { type: Boolean, default: false },
      budgetPerStaff: { type: Number, default: 0, min: 0 },
      budgetCurrency: { type: String, default: "USD", trim: true },
    },
    // ─── Notifications ────────────────────────────
    notifications: {
      leaveRequestNotifyAdmin: { type: Boolean, default: true },
      leaveApprovalNotifyStaff: { type: Boolean, default: true },
      certExpiryNotifyStaff: { type: Boolean, default: true },
      certExpiryNotifyAdmin: { type: Boolean, default: true },
      contractRenewalNotifyAdmin: { type: Boolean, default: true },
      reviewDueNotifyReviewer: { type: Boolean, default: true },
      reviewDueNotifyStaff: { type: Boolean, default: true },
    },
    // ─── Staff ID Format ──────────────────────────
    employeeIdFormat: {
      prefix: { type: String, default: "EMP", trim: true },
      autoGenerate: { type: Boolean, default: true },
      nextNumber: { type: Number, default: 1 },
      zeroPadding: { type: Number, default: 4 },
    },
  },
  { timestamps: true }
);

hrSettingsSchema.plugin(tenantIsolationPlugin);

const HRSettings = mongoose.model("HRSettings", hrSettingsSchema);
export default HRSettings;
