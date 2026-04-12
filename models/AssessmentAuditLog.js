import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const assessmentAuditLogSchema = new mongoose.Schema(
  {
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
    },
    action: {
      type: String,
      enum: [
        'progress_table_sent',
        'narrative_generated',
        'narrative_approved',
        'narrative_sent',
        'narrative_expired',
        'assessment_edited',
        'revision_created',
        'revision_published',
        'pool_draft_created',
        'settings_updated',
        'permission_changed',
      ],
      required: true,
    },
    messageType: {
      type: String,
      enum: ['table', 'narrative', 'table+narrative', 'revision', 'pool', 'settings', null],
      default: null,
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      default: null,
    },
    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      default: null,
    },
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      default: null,
    },
    assignment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StandardAssignment',
      default: null,
    },
    narrativeReport: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AssessmentNarrative',
      default: null,
    },
    revision: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AssessmentRevision',
      default: null,
    },
    recipientTypes: {
      type: [String],
      enum: ['student', 'parent'],
      default: [],
    },
    recipientIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    selectedStandardRowIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Standard',
      },
    ],
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    channelStatus: {
      email: {
        type: String,
        enum: ['pending', 'sent', 'failed', 'skipped', null],
        default: null,
      },
      inApp: {
        type: String,
        enum: ['pending', 'sent', 'failed', 'skipped', null],
        default: null,
      },
      sms: {
        type: String,
        enum: ['pending', 'sent', 'failed', 'skipped', null],
        default: null,
      },
    },
    deliveryRetries: { type: Number, default: 0 },
    lastRetryAt: { type: Date, default: null },
    idempotencyKey: {
      type: String,
      trim: true,
      default: null,
    },
    beforeState: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    afterState: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    ipAddress: { type: String, trim: true, default: null },
  },
  { timestamps: true }
);

assessmentAuditLogSchema.index({ school: 1, action: 1, createdAt: -1 });
assessmentAuditLogSchema.index({ school: 1, performedBy: 1, createdAt: -1 });
assessmentAuditLogSchema.index({ school: 1, student: 1, createdAt: -1 });
assessmentAuditLogSchema.index({ school: 1, assignment: 1, createdAt: -1 });
assessmentAuditLogSchema.index({ idempotencyKey: 1 }, { sparse: true });
assessmentAuditLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 365 * 24 * 3600 }
);

assessmentAuditLogSchema.plugin(tenantIsolationPlugin);

const AssessmentAuditLog = mongoose.model('AssessmentAuditLog', assessmentAuditLogSchema);
export default AssessmentAuditLog;
