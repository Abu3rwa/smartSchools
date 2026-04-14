import mongoose from "mongoose";
import { tenantIsolationPlugin } from "../middleware/tenantIsolation.js";

const certificationSchema = new mongoose.Schema(
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
    name: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: [
        "teaching_license",
        "subject_certification",
        "first_aid",
        "cpr",
        "safeguarding",
        "special_education",
        "leadership",
        "technology",
        "language",
        "other",
      ],
      default: "other",
    },
    issuedBy: { type: String, trim: true },
    issueDate: { type: Date },
    expiryDate: { type: Date },
    credentialId: { type: String, trim: true },
    documentUrl: { type: String, trim: true },
    documentFileName: { type: String, trim: true },
    // ─── Requirement tracking ─────────────────────
    isRequired: { type: Boolean, default: false }, // school requires this
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    verifiedAt: { type: Date },
    notes: { type: String, trim: true, maxlength: 2000 },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

certificationSchema.virtual("status").get(function () {
  if (!this.expiryDate) return "valid";
  const now = new Date();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  if (this.expiryDate < now) return "expired";
  if (this.expiryDate - now < thirtyDays) return "expiring_soon";
  return "valid";
});

certificationSchema.index({ school: 1, staff: 1 });
certificationSchema.index({ school: 1, expiryDate: 1 }); // expiring certs alert
certificationSchema.index({ school: 1, category: 1 });

certificationSchema.plugin(tenantIsolationPlugin);

const Certification = mongoose.model("Certification", certificationSchema);
export default Certification;
