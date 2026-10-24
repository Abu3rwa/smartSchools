import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const assessmentPassageSchema = new mongoose.Schema({
  school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  contextType: { type: String, enum: ['map_practice', 'standards'], required: true },
  plan: { type: mongoose.Schema.Types.ObjectId, ref: 'MapPracticePlan', default: null },
  assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'StandardAssignment', default: null },
  passageKey: { type: String, required: true, trim: true, maxlength: 180 },
  title: { type: String, default: '', trim: true, maxlength: 220 },
  text: { type: String, required: true, trim: true, maxlength: 12000 },
  source: { type: String, default: '', trim: true, maxlength: 500 },
  language: { type: String, default: '', trim: true, maxlength: 12 },
  accessibilityText: { type: String, default: '', trim: true, maxlength: 2000 },
  contentHash: { type: String, default: '', trim: true, maxlength: 128 },
  active: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

assessmentPassageSchema.index(
  { school: 1, contextType: 1, plan: 1, assignment: 1, passageKey: 1 },
  { unique: true }
);
assessmentPassageSchema.index({ school: 1, contextType: 1, active: 1 });
assessmentPassageSchema.plugin(tenantIsolationPlugin);

export default mongoose.model('AssessmentPassage', assessmentPassageSchema);
