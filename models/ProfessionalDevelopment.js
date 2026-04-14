import mongoose from "mongoose";
import { tenantIsolationPlugin } from "../middleware/tenantIsolation.js";

const professionalDevelopmentSchema = new mongoose.Schema(
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
    title: { type: String, required: true, trim: true },
    provider: { type: String, trim: true },
    category: {
      type: String,
      enum: [
        "curriculum",
        "instruction",
        "technology",
        "assessment",
        "leadership",
        "sel",
        "special_education",
        "classroom_management",
        "safety",
        "compliance",
        "language",
        "subject_specific",
        "other",
      ],
      default: "other",
    },
    type: {
      type: String,
      enum: ["workshop", "conference", "course", "webinar", "coaching", "mentoring", "self_study", "certification_prep", "other"],
      default: "workshop",
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    hours: { type: Number, required: true, min: 0 },
    // ─── Credits / CEU ────────────────────────────
    credits: { type: Number, default: 0, min: 0 },
    creditType: { type: String, trim: true }, // CEU, CLU, etc.
    // ─── Evidence ─────────────────────────────────
    certificateUrl: { type: String, trim: true },
    description: { type: String, trim: true, maxlength: 3000 },
    outcomes: { type: String, trim: true, maxlength: 2000 },
    // ─── Funding ──────────────────────────────────
    fundedBy: { type: String, enum: ["school", "self", "grant", "sponsor", "other", ""], default: "" },
    cost: { type: Number, min: 0 },
    // ─── Approval ─────────────────────────────────
    status: {
      type: String,
      enum: ["planned", "in_progress", "completed", "verified", "rejected"],
      default: "completed",
    },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    verifiedAt: { type: Date },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

professionalDevelopmentSchema.index({ school: 1, staff: 1, startDate: -1 });
professionalDevelopmentSchema.index({ school: 1, category: 1 });
professionalDevelopmentSchema.index({ school: 1, startDate: -1 }); // school-wide reports

professionalDevelopmentSchema.plugin(tenantIsolationPlugin);

const ProfessionalDevelopment = mongoose.model("ProfessionalDevelopment", professionalDevelopmentSchema);
export default ProfessionalDevelopment;
