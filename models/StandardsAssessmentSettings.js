import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const standardsAssessmentSettingsSchema = new mongoose.Schema(
  {
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
    },

    // ── Global Feature Toggles ──
    enablePoolLibrary: { type: Boolean, default: true },
    enableProgressTableSend: { type: Boolean, default: true },
    enableNarrativeReports: { type: Boolean, default: true },
    enableLiveAssessmentEditing: { type: Boolean, default: true },
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

    // ── Feature 2: Progress Table Send Restrictions ──
    progressSend: {
      allowSendUnfinishedRows: { type: Boolean, default: true },
      maxSendsPerStudentPerDay: { type: Number, default: 3, min: 1, max: 50 },
      cooldownMinutes: { type: Number, default: 60, min: 0, max: 1440 },
      requireMinFinishedRows: { type: Number, default: 0, min: 0, max: 50 },
      ccTeacherOnEmail: { type: Boolean, default: true },
      allowTeacherNote: { type: Boolean, default: true },
      maxTeacherNoteLength: { type: Number, default: 1000, min: 0, max: 5000 },
      parentOptOutEnabled: { type: Boolean, default: true },
      showClassAverageInTable: { type: Boolean, default: false },
      showRankOrPercentile: { type: Boolean, default: false },
      allowedChannels: {
        type: [String],
        enum: ['email', 'inApp', 'sms'],
        default: ['email', 'inApp'],
      },
      retryFailedDeliveryCount: { type: Number, default: 3, min: 0, max: 10 },
      retryIntervalMinutes: { type: Number, default: 15, min: 1, max: 120 },
    },

    // ── Feature 3: AI Narrative Report Restrictions ──
    narrative: {
      requireTeacherApproval: { type: Boolean, default: true },
      maxNarrativeGenerationsPerDay: { type: Number, default: 50, min: 1, max: 500 },
      maxStandardsPerNarrative: { type: Number, default: 10, min: 1, max: 30 },
      minEvidenceThreshold: { type: Number, default: 1, min: 1, max: 20 },
      maxNarrativeLength: { type: Number, default: 2000, min: 200, max: 10000 },
      minNarrativeLength: { type: Number, default: 150, min: 50, max: 1000 },
      defaultLanguage: {
        type: String,
        enum: ['en', 'ar', 'fr'],
        default: 'en',
      },
      supportedLanguages: {
        type: [String],
        default: ['en', 'ar'],
      },
      toneProfile: {
        type: String,
        enum: ['supportive', 'neutral', 'formal'],
        default: 'supportive',
      },
      allowedToneProfiles: {
        type: [String],
        enum: ['supportive', 'neutral', 'formal'],
        default: ['supportive', 'neutral', 'formal'],
      },
      includeEvidenceQuotes: { type: Boolean, default: true },
      enableProfanityFilter: { type: Boolean, default: true },
      enableReadabilityCheck: { type: Boolean, default: true },
      allowSendWithoutTable: { type: Boolean, default: true },
      allowSendWithTable: { type: Boolean, default: true },
      draftExpiryHours: { type: Number, default: 72, min: 1, max: 720 },
      maxTeacherEditDriftPercent: { type: Number, default: 80, min: 0, max: 100 },
      bannedPhrases: { type: [String], default: [] },
    },

    // ── Feature 4: Live Assessment Edit Restrictions ──
    liveEdit: {
      allowContentEditAfterStart: { type: Boolean, default: true },
      maxRevisionsPerAssessment: { type: Number, default: 10, min: 1, max: 50 },
      lockBeforeDueDate: { type: Boolean, default: false },
      lockWindowHours: { type: Number, default: 24, min: 1, max: 168 },
      notifyStudentsOnRevision: { type: Boolean, default: true },
      notifyParentsOnRevision: { type: Boolean, default: false },
      defaultRevisionPolicy: {
        type: String,
        enum: ['not-started-only', 'not-started-and-in-progress', 'all-future-attempts'],
        default: 'not-started-only',
      },
      allowedRevisionPolicies: {
        type: [String],
        enum: ['not-started-only', 'not-started-and-in-progress', 'all-future-attempts'],
        default: ['not-started-only'],
      },
      requireConfirmationForContentEdit: { type: Boolean, default: true },
      allowQuestionRemoval: { type: Boolean, default: true },
      allowQuestionAddition: { type: Boolean, default: true },
      allowScoringWeightChange: { type: Boolean, default: true },
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

    // ── Audit And Compliance Settings ──
    audit: {
      retentionDays: { type: Number, default: 365, min: 30, max: 3650 },
      logNarrativeDraftVersions: { type: Boolean, default: true },
      logProgressTableContent: { type: Boolean, default: true },
      exportEnabled: { type: Boolean, default: true },
      alertOnBulkSend: { type: Number, default: 20, min: 1, max: 100 },
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
