import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

/**
 * One prepaid AI balance per teacher, plus one school pool per school. Amounts are
 * US cents and may carry fractions of a cent, because a single feedback run
 * usually costs less than one.
 *
 * A user balance has two sources: `schoolCents` came from the school pool (the
 * school admin may take it back) and the rest was granted by the platform
 * (not reclaimable). A pool row keeps the unallocated reserve and is never spent
 * directly by AI requests; money leaves it only through an allocation.
 */
const aiCreditAccountSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    kind: { type: String, enum: ['user', 'school'], default: 'user', index: true },
    balanceCents: { type: Number, default: 0 },
    schoolCents: { type: Number, default: 0 },
    grantedCents: { type: Number, default: 0 },
    spentCents: { type: Number, default: 0 },
    reservePercent: { type: Number, default: 30, min: 0, max: 100 },
    lowBalanceCents: { type: Number, default: 100, min: 0 },
    paused: { type: Boolean, default: false },
    lastGrantAt: { type: Date },
    alerts: {
      lowSentAt: { type: Date, default: null },
      emptySentAt: { type: Date, default: null }
    }
  },
  { timestamps: true }
);

// With user null for the pool, this also keeps each school to a single pool row.
aiCreditAccountSchema.index({ school: 1, user: 1 }, { unique: true });
aiCreditAccountSchema.plugin(tenantIsolationPlugin);

const AiCreditAccount = mongoose.model('AiCreditAccount', aiCreditAccountSchema);
export default AiCreditAccount;
