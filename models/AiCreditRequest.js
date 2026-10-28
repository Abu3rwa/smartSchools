import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const aiCreditRequestSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // A teacher asks the school admin for a personal allocation; a school admin
    // asks the platform owner for a top-up to the school pool.
    target: { type: String, enum: ['teacher', 'pool'], default: 'teacher' },
    amountCents: { type: Number, required: true, min: 1 },
    note: { type: String, trim: true, default: '' },
    status: {
      type: String,
      enum: ['pending', 'approved', 'declined', 'cancelled'],
      default: 'pending'
    },
    grantedCents: { type: Number, default: 0 },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    decidedAt: { type: Date },
    decisionNote: { type: String, trim: true, default: '' }
  },
  { timestamps: true }
);

aiCreditRequestSchema.index({ school: 1, status: 1, createdAt: -1 });
aiCreditRequestSchema.index({ school: 1, user: 1, createdAt: -1 });
// One open request per teacher; a second click must not queue a duplicate.
aiCreditRequestSchema.index(
  { school: 1, user: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
);
aiCreditRequestSchema.plugin(tenantIsolationPlugin);

const AiCreditRequest = mongoose.model('AiCreditRequest', aiCreditRequestSchema);
export default AiCreditRequest;
