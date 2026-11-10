import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const plpEvidenceSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    plpRecord: { type: mongoose.Schema.Types.ObjectId, ref: 'PlpStudentRecord', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null },
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    traitId: { type: mongoose.Schema.Types.ObjectId, ref: 'PlpTraitConfig', default: null },
    type: { type: String, enum: ['observation', 'incident', 'positive_example', 'reflection'], required: true },
    note: { type: String, required: true, maxlength: 1000 },
    taggedTraits: [{ type: String }],
    source: { type: String, enum: ['manual', 'ai_classified'], default: 'manual' },
    aiConfidence: { type: String, enum: ['high', 'medium', 'low', null], default: null },
    aiRationale: { type: String, default: null },
    reviewStatus: { type: String, enum: ['confirmed', 'needs_review'], default: 'confirmed' },
    // Where the observation came from. The timetable context lets parent updates
    // say which lesson the note belongs to instead of only the date.
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', default: null },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', default: null },
    period: { type: mongoose.Schema.Types.ObjectId, ref: 'TimetablePeriod', default: null },
    capturedVia: { type: String, enum: ['manual', 'timetable'], default: 'manual' },
}, { timestamps: true });

plpEvidenceSchema.plugin(tenantIsolationPlugin);
plpEvidenceSchema.index({ school: 1, plpRecord: 1 });
plpEvidenceSchema.index({ school: 1, student: 1, createdAt: -1 });

export default mongoose.model('PlpEvidence', plpEvidenceSchema);
