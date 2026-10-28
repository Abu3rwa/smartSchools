import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

/**
 * Ledger row: a grant/adjustment by an admin, or one AI request a teacher ran.
 * Labels are copied at write time so the history still reads well after a
 * task or student is renamed or removed.
 */
const aiCreditEntrySchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    accountType: { type: String, enum: ['user', 'school'], default: 'user' },
    type: {
      type: String,
      enum: ['grant', 'adjustment', 'usage', 'allocation', 'reclaim', 'fund'],
      required: true
    },
    // Which pot paid a usage row: the school allocation or a platform grant.
    source: { type: String, enum: ['', 'school', 'mixed', 'grant'], default: '' },
    amountCents: { type: Number, default: 0 },
    costCents: { type: Number, default: 0 },
    chargedCents: { type: Number },
    profitCents: { type: Number },
    markupPercent: { type: Number },
    charged: { type: Boolean, default: true },
    balanceAfterCents: { type: Number },

    feature: { type: String, trim: true, default: '' },
    outcome: { type: String, enum: ['done', 'unusable', ''], default: '' },
    model: { type: String, trim: true, default: '' },
    inputTokens: { type: Number, default: 0 },
    cachedInputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 },
    rates: {
      inputPerMillionCents: { type: Number },
      cachedInputPerMillionCents: { type: Number },
      outputPerMillionCents: { type: Number }
    },

    assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'WritingAssignment' },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'WritingProject' },
    draft: { type: mongoose.Schema.Types.ObjectId, ref: 'WritingDraft' },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    assignmentTitle: { type: String, trim: true, default: '' },
    studentName: { type: String, trim: true, default: '' },
    draftNumber: { type: Number },

    request: { type: mongoose.Schema.Types.ObjectId, ref: 'AiCreditRequest' },
    note: { type: String, trim: true, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

aiCreditEntrySchema.index({ school: 1, user: 1, createdAt: -1 });
aiCreditEntrySchema.index({ school: 1, type: 1, createdAt: -1 });
aiCreditEntrySchema.plugin(tenantIsolationPlugin);

const AiCreditEntry = mongoose.model('AiCreditEntry', aiCreditEntrySchema);
export default AiCreditEntry;
