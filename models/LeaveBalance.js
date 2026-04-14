import mongoose from "mongoose";
import { tenantIsolationPlugin } from "../middleware/tenantIsolation.js";

const leaveBalanceSchema = new mongoose.Schema(
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
    academicYear: { type: String, required: true },
    allocated: { type: Number, required: true, min: 0 },
    used: { type: Number, default: 0, min: 0 },
    pending: { type: Number, default: 0, min: 0 },
    carriedOver: { type: Number, default: 0, min: 0 },
    adjustment: { type: Number, default: 0 }, // manual admin adjustments (+/-)
    adjustmentNotes: { type: String, trim: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

leaveBalanceSchema.virtual("remaining").get(function () {
  return this.allocated + this.carriedOver + this.adjustment - this.used - this.pending;
});

leaveBalanceSchema.index(
  { school: 1, staff: 1, leaveType: 1, academicYear: 1 },
  { unique: true }
);

leaveBalanceSchema.plugin(tenantIsolationPlugin);

const LeaveBalance = mongoose.model("LeaveBalance", leaveBalanceSchema);
export default LeaveBalance;
