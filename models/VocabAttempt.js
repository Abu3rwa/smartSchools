import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const vocabAttemptSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    sessionId: { type: String, required: true, maxlength: 64 },
    type: { type: String, enum: ['spelling', 'match', 'fill', 'pos', 'mcq', 'use_it'], required: true },
    word: { type: mongoose.Schema.Types.ObjectId, ref: 'VocabWord', default: null },
    questionId: { type: String, default: '', maxlength: 64 },
    listId: { type: String, default: '' },
    given: { type: String, default: '', maxlength: 600 },
    choice: { type: String, default: '', maxlength: 1 },
    // null = waiting for a teacher ("Use it" sentences)
    correct: { type: Boolean, default: null },
    status: { type: String, enum: ['graded', 'pending', 'accepted', 'needs_work'], default: 'graded' },
    teacherComment: { type: String, default: '', maxlength: 500 },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    timeMs: { type: Number, default: 0, min: 0, max: 3600000 }
}, { timestamps: true });

vocabAttemptSchema.index({ school: 1, student: 1, createdAt: -1 });
vocabAttemptSchema.index({ school: 1, type: 1, status: 1, createdAt: -1 });
vocabAttemptSchema.plugin(tenantIsolationPlugin);

export default mongoose.model('VocabAttempt', vocabAttemptSchema);
