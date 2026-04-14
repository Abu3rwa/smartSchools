import mongoose from "mongoose";
import { tenantIsolationPlugin } from "../middleware/tenantIsolation.js";

const contractSchema = new mongoose.Schema(
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
    contractNumber: { type: String, trim: true },
    type: {
      type: String,
      enum: ["full_time", "part_time", "contract", "temporary", "probationary", "internship"],
      required: true,
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, default: null }, // null = indefinite
    // ─── Compensation (display-only) ──────────────
    salary: {
      amount: { type: Number, min: 0 },
      currency: { type: String, default: "USD", trim: true },
      frequency: {
        type: String,
        enum: ["monthly", "biweekly", "weekly", "annual", "hourly"],
        default: "monthly",
      },
    },
    // ─── Allowances ───────────────────────────────
    allowances: [
      {
        name: { type: String, trim: true },  // housing, transport, phone, etc.
        amount: { type: Number, min: 0 },
        frequency: { type: String, enum: ["monthly", "annual", "one_time"], default: "monthly" },
      },
    ],
    benefits: [{ type: String, trim: true }], // health, housing, transport, etc.
    // ─── Work Schedule ────────────────────────────
    workSchedule: {
      hoursPerWeek: { type: Number, min: 0 },
      workDays: [{ type: String, enum: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] }],
    },
    // ─── Documents ────────────────────────────────
    documentUrl: { type: String, trim: true },
    amendments: [
      {
        date: { type: Date, default: Date.now },
        description: { type: String, trim: true },
        documentUrl: { type: String, trim: true },
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      },
    ],
    // ─── Status ───────────────────────────────────
    status: {
      type: String,
      enum: ["draft", "active", "expired", "terminated", "renewed"],
      default: "draft",
    },
    renewalDate: { type: Date },
    terminationDate: { type: Date },
    terminationReason: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

contractSchema.index({ school: 1, staff: 1, status: 1 });
contractSchema.index({ school: 1, endDate: 1, status: 1 }); // expiring contracts query
contractSchema.index({ school: 1, renewalDate: 1 });

contractSchema.plugin(tenantIsolationPlugin);

const Contract = mongoose.model("Contract", contractSchema);
export default Contract;
