import mongoose from "mongoose";
import { tenantIsolationPlugin } from "../middleware/tenantIsolation.js";

const staffProfileSchema = new mongoose.Schema(
  {
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Link to academic Teacher record (null for non-teaching staff)
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher",
      default: null,
    },
    staffType: {
      type: String,
      enum: [
        "teacher",
        "admin",
        "support",
        "counselor",
        "librarian",
        "nurse",
        "driver",
        "security",
        "maintenance",
        "accountant",
        "receptionist",
        "lab_technician",
        "it_support",
        "cafeteria",
        "other",
      ],
      required: true,
      index: true,
    },
    employeeId: {
      type: String,
      required: true,
      trim: true,
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      default: null,
    },
    // ─── Personal Info ────────────────────────────
    personalInfo: {
      dateOfBirth: Date,
      gender: { type: String, enum: ["male", "female", "other", ""] },
      nationality: { type: String, trim: true },
      nationalId: { type: String, trim: true },
      maritalStatus: {
        type: String,
        enum: ["single", "married", "divorced", "widowed", ""],
      },
      bloodType: {
        type: String,
        enum: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", ""],
      },
      address: {
        street: { type: String, trim: true },
        city: { type: String, trim: true },
        state: { type: String, trim: true },
        zipCode: { type: String, trim: true },
        country: { type: String, trim: true },
      },
      emergencyContacts: [
        {
          name: { type: String, trim: true },
          relationship: { type: String, trim: true },
          phone: { type: String, trim: true },
          email: { type: String, trim: true },
        },
      ],
      photoUrl: { type: String, trim: true },
    },
    // ─── Employment ───────────────────────────────
    hireDate: { type: Date, default: Date.now },
    endDate: { type: Date, default: null },
    probationEndDate: { type: Date, default: null },
    status: {
      type: String,
      enum: ["active", "on_leave", "probation", "suspended", "resigned", "terminated"],
      default: "active",
      index: true,
    },
    // ─── Qualifications ───────────────────────────
    qualifications: [
      {
        degree: { type: String, trim: true },
        field: { type: String, trim: true },
        institution: { type: String, trim: true },
        year: Number,
        documentUrl: { type: String, trim: true },
      },
    ],
    // ─── Banking / Payroll (display-only, no calculation) ──
    bankInfo: {
      bankName: { type: String, trim: true },
      accountNumber: { type: String, trim: true },
      iban: { type: String, trim: true },
      swiftCode: { type: String, trim: true },
    },
    // ─── Notes & Custom Fields ────────────────────
    notes: { type: String, trim: true, maxlength: 5000 },
    customFields: { type: Map, of: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

staffProfileSchema.index({ school: 1, employeeId: 1 }, { unique: true });
staffProfileSchema.index({ school: 1, staffType: 1, status: 1 });
staffProfileSchema.index({ school: 1, department: 1 });
staffProfileSchema.index({ school: 1, isActive: 1 });

staffProfileSchema.virtual("fullName", {
  ref: "User",
  localField: "user",
  foreignField: "_id",
  justOne: true,
});

staffProfileSchema.plugin(tenantIsolationPlugin);

const StaffProfile = mongoose.model("StaffProfile", staffProfileSchema);
export default StaffProfile;
