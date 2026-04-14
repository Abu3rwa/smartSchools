import mongoose from "mongoose";
import { tenantIsolationPlugin } from "../middleware/tenantIsolation.js";

const leaveTypeSchema = new mongoose.Schema(
  {
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    nameAr: { type: String, trim: true, default: "" },
    code: { type: String, trim: true, lowercase: true },
    description: { type: String, trim: true },
    color: { type: String, default: "#6366f1", trim: true }, // calendar display
    // ─── Allocation ───────────────────────────────
    daysPerYear: { type: Number, required: true, min: 0 },
    // ─── Carry-Over Policy ────────────────────────
    carryOver: { type: Boolean, default: false },
    maxCarryDays: { type: Number, default: 0, min: 0 },
    // ─── Pay ──────────────────────────────────────
    paidPercentage: { type: Number, default: 100, min: 0, max: 100 },
    // ─── Rules ────────────────────────────────────
    requiresDocument: { type: Boolean, default: false },
    minDaysNotice: { type: Number, default: 0, min: 0 }, // advance notice
    maxConsecutiveDays: { type: Number, default: 0, min: 0 }, // 0 = no limit
    allowHalfDay: { type: Boolean, default: false },
    allowNegativeBalance: { type: Boolean, default: false },
    // ─── Applicability ────────────────────────────
    appliesTo: [
      {
        type: String,
        enum: [
          "teacher", "admin", "support", "counselor", "librarian", "nurse",
          "driver", "security", "maintenance", "accountant", "receptionist",
          "lab_technician", "it_support", "cafeteria", "other",
        ],
      },
    ], // empty = all staff types
    // ─── Gender restrictions (maternity/paternity) ──
    genderRestriction: {
      type: String,
      enum: ["", "male", "female"],
      default: "",
    },
    // ─── Approval chain ───────────────────────────
    requiresApproval: { type: Boolean, default: true },
    autoApprove: { type: Boolean, default: false },
    approvalLevels: { type: Number, default: 1, min: 1, max: 3 },
    // ─── Status ───────────────────────────────────
    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

leaveTypeSchema.index({ school: 1, isActive: 1, order: 1 });
leaveTypeSchema.index({ school: 1, code: 1 }, { unique: true, sparse: true });

leaveTypeSchema.plugin(tenantIsolationPlugin);

const LeaveType = mongoose.model("LeaveType", leaveTypeSchema);
export default LeaveType;
