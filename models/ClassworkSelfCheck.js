import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const checkRuleSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true },
    labelAr: { type: String, default: '' },
    value: { type: Number, required: true },
    direction: { type: String, enum: ['positive', 'negative'], default: 'positive' }
  },
  { _id: false }
);

/**
 * One self-check per class, subject and day. The rule list is a snapshot taken
 * when the check opens, so later rule edits never change a check already running.
 */
const classworkSelfCheckSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    academicYear: { type: String, trim: true },
    date: { type: Date, required: true },
    maxMarks: { type: Number, default: 10, min: 0 },
    status: { type: String, enum: ['open', 'closed'], default: 'open' },
    openedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    rules: { type: [checkRuleSchema], default: [] }
  },
  { timestamps: true }
);

classworkSelfCheckSchema.index(
  { school: 1, class: 1, subject: 1, date: 1 },
  { unique: true, partialFilterExpression: { status: 'open' } }
);
classworkSelfCheckSchema.index({ school: 1, status: 1, date: 1, class: 1 });

classworkSelfCheckSchema.plugin(tenantIsolationPlugin);

const ClassworkSelfCheck = mongoose.model('ClassworkSelfCheck', classworkSelfCheckSchema);
export default ClassworkSelfCheck;
