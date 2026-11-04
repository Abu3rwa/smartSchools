import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

/**
 * One student's ticks for one check. Only rule ids are stored: the mark is
 * always recomputed from the check's snapshot, never trusted from a client.
 */
const classworkSelfCheckResponseSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    check: { type: mongoose.Schema.Types.ObjectId, ref: 'ClassworkSelfCheck', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    selectedRuleIds: { type: [String], default: [] },
    submittedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

classworkSelfCheckResponseSchema.index({ check: 1, student: 1 }, { unique: true });
classworkSelfCheckResponseSchema.index({ school: 1, student: 1, check: 1 });

classworkSelfCheckResponseSchema.plugin(tenantIsolationPlugin);

const ClassworkSelfCheckResponse = mongoose.model('ClassworkSelfCheckResponse', classworkSelfCheckResponseSchema);
export default ClassworkSelfCheckResponse;
