import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const standardsAssessmentSettingsSchema = new mongoose.Schema(
  {
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
    },

    maintenanceMode: { type: Boolean, default: false },

    // ── Feature 1: Pool Library Restrictions ──
    pool: {
      maxQuestionsPerAssessment: { type: Number, default: 50, min: 1, max: 200 },
      minQuestionsPerAssessment: { type: Number, default: 1, min: 1, max: 50 },
      visibilityScope: {
        type: String,
        enum: ['school', 'grade', 'teacher'],
        default: 'school',
      },
      allowCrossSubjectBrowsing: { type: Boolean, default: false },
      allowCrossGradeBrowsing: { type: Boolean, default: false },
      requireAdminApprovalForPoolDraft: { type: Boolean, default: false },
      maxDraftsPerTeacherPerDay: { type: Number, default: 20, min: 1, max: 100 },
      showReusedCount: { type: Boolean, default: true },
      allowDuplicateQuestionsInAssessment: { type: Boolean, default: false },
    },

    // ── Communication And Notification Preferences ──
    comms: {
      emailFromName: { type: String, trim: true, default: '' },
      emailReplyTo: { type: String, trim: true, default: null },
      emailFooterText: { type: String, trim: true, default: '' },
      inAppNotificationEnabled: { type: Boolean, default: true },
      parentPreferredLanguage: {
        type: String,
        enum: ['en', 'ar', 'fr'],
        default: 'en',
      },
      includeSchoolLogo: { type: Boolean, default: true },
      quietHoursStart: { type: String, default: null },
      quietHoursEnd: { type: String, default: null },
      quietHoursTimezone: { type: String, default: 'Asia/Riyadh' },
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

standardsAssessmentSettingsSchema.index({ school: 1 }, { unique: true });

standardsAssessmentSettingsSchema.plugin(tenantIsolationPlugin);

const StandardsAssessmentSettings = mongoose.model(
  'StandardsAssessmentSettings',
  standardsAssessmentSettingsSchema
);
export default StandardsAssessmentSettings;
