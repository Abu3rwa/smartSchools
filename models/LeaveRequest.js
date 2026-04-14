import mongoose from "mongoose";
import { tenantIsolationPlugin } from "../middleware/tenantIsolation.js";

const leaveRequestSchema = new mongoose.Schema(
  {
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    staff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StaffProfile",
      required: true,
      index: true,
    },
    leaveType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LeaveType",
      required: true,
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    days: { type: Number, required: true, min: 0.5 },
    isHalfDay: { type: Boolean, default: false },
    halfDayPeriod: { type: String, enum: ["", "morning", "afternoon"], default: "" },
    reason: { type: String, required: true, trim: true, maxlength: 2000 },
    documentUrl: { type: String, trim: true },
    documentFileName: { type: String, trim: true },
    // ─── Contact while on leave ───────────────────
    contactPhone: { type: String, trim: true },
    delegateTo: { type: mongoose.Schema.Types.ObjectId, ref: "StaffProfile" },
    // ─── Approval workflow ────────────────────────
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "cancelled", "recalled"],
      default: "pending",
      index: true,
    },
    approvalChain: [
      {
        level: { type: Number, required: true },
        approver: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        status: {
          type: String,
          enum: ["pending", "approved", "rejected"],
          default: "pending",
        },
        date: Date,
        note: { type: String, trim: true },
      },
    ],
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
    reviewNote: { type: String, trim: true },
    // ─── Integration ──────────────────────────────
    substitutionRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubstitutionRequest",
    },
    // ─── Cancellation ─────────────────────────────
    cancelledAt: { type: Date },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    cancellationReason: { type: String, trim: true },
    // ─── Recall (admin recalls from leave early) ──
    recalledAt: { type: Date },
    recalledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    recallReason: { type: String, trim: true },
    actualReturnDate: { type: Date },
  },
  { timestamps: true }
);

leaveRequestSchema.index({ school: 1, status: 1, startDate: 1 });
leaveRequestSchema.index({ school: 1, staff: 1, startDate: 1, endDate: 1 });
leaveRequestSchema.index({ school: 1, startDate: 1, endDate: 1 }); // calendar query

leaveRequestSchema.plugin(tenantIsolationPlugin);

const LeaveRequest = mongoose.model("LeaveRequest", leaveRequestSchema);
export default LeaveRequest;
