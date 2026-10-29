import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';
import { SPELLING_GRADES } from '../utils/spellingAnalysisConfig.js';

const monthPointSchema = new mongoose.Schema({
    key: { type: String, required: true },
    attempts: { type: Number, default: 0, min: 0 },
    correct: { type: Number, default: 0, min: 0 },
    accuracy: { type: Number, default: 0, min: 0, max: 100 },
    flagged: { type: Number, default: 0, min: 0 },
    resolved: { type: Number, default: 0, min: 0 },
    recoveryRate: { type: Number, default: 0, min: 0, max: 100 }
}, { _id: false });

const breakdownRowSchema = new mongoose.Schema({
    label: { type: String, default: '' },
    attempts: { type: Number, default: 0, min: 0 },
    correct: { type: Number, default: 0, min: 0 },
    misses: { type: Number, default: 0, min: 0 },
    accuracy: { type: Number, default: 0, min: 0, max: 100 }
}, { _id: false });

const errorTypeSchema = new mongoose.Schema({
    type: { type: String, required: true },
    count: { type: Number, default: 0, min: 0 },
    share: { type: Number, default: 0, min: 0, max: 100 },
    examples: { type: [String], default: [] }
}, { _id: false });

const missedWordSchema = new mongoose.Schema({
    word: { type: String, required: true },
    misses: { type: Number, default: 0, min: 0 }
}, { _id: false });

const metricsSchema = new mongoose.Schema({
    sessions: { type: Number, default: 0, min: 0 },
    completedSessions: { type: Number, default: 0, min: 0 },
    abandonedSessions: { type: Number, default: 0, min: 0 },
    attempts: { type: Number, default: 0, min: 0 },
    correct: { type: Number, default: 0, min: 0 },
    incorrect: { type: Number, default: 0, min: 0 },
    skipped: { type: Number, default: 0, min: 0 },
    accuracy: { type: Number, default: 0, min: 0, max: 100 },
    skippedRate: { type: Number, default: 0, min: 0, max: 100 },
    flagged: { type: Number, default: 0, min: 0 },
    resolved: { type: Number, default: 0, min: 0 },
    practiceMastered: { type: Number, default: 0, min: 0 },
    pending: { type: Number, default: 0, min: 0 },
    expired: { type: Number, default: 0, min: 0 },
    overdue: { type: Number, default: 0, min: 0 },
    recoveryRate: { type: Number, default: 0, min: 0, max: 100 },
    cleanRecoveryRate: { type: Number, default: 0, min: 0, max: 100 },
    averageRecoveryDays: { type: Number, default: null },
    recurrence: { type: Number, default: 0, min: 0 },
    months: { type: [monthPointSchema], default: [] },
    categories: { type: [breakdownRowSchema], default: [] },
    grades: { type: [breakdownRowSchema], default: [] },
    weeks: { type: [breakdownRowSchema], default: [] },
    errorTypes: { type: [errorTypeSchema], default: [] },
    topMissedWords: { type: [missedWordSchema], default: [] },
    trend: {
        direction: { type: String, enum: ['improving', 'declining', 'flat', 'insufficient'], default: 'insufficient' },
        delta: { type: Number, default: 0 }
    }
}, { _id: false });

const spellingAnalysisSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    studentName: { type: String, trim: true, maxlength: 160, default: '' },
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', default: null },
    className: { type: String, trim: true, maxlength: 160, default: '' },
    academicYear: { type: String, trim: true, default: null },
    grade: { type: String, enum: [...SPELLING_GRADES, null], default: null },
    period: {
        kind: { type: String, enum: ['month', 'all'], default: 'month', required: true },
        key: { type: String, trim: true, maxlength: 20, required: true }
    },
    metrics: { type: metricsSchema, default: () => ({}) },
    strengths: { type: [String], default: [] },
    gaps: { type: [String], default: [] },
    recommendation: { type: String, default: '', maxlength: 1200 },
    narrative: { type: String, default: '', maxlength: 4000 },
    ai: {
        modelName: { type: String, default: '' },
        promptVersion: { type: String, default: '' },
        inputHash: { type: String, default: '' },
        entryId: { type: String, default: '' },
        chargedCents: { type: Number, default: 0, min: 0 },
        error: { type: String, default: '' }
    },
    status: { type: String, enum: ['ready', 'failed'], default: 'ready' },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true, suppressReservedKeysWarning: true });

spellingAnalysisSchema.index(
    { school: 1, student: 1, 'period.kind': 1, 'period.key': 1 },
    { unique: true, name: 'school_student_period_unique' }
);
spellingAnalysisSchema.index({ school: 1, grade: 1, 'period.kind': 1, 'period.key': 1, status: 1 });
spellingAnalysisSchema.index({ school: 1, class: 1, 'period.kind': 1, 'period.key': 1 });
spellingAnalysisSchema.plugin(tenantIsolationPlugin);

const SpellingAnalysis = mongoose.model('SpellingAnalysis', spellingAnalysisSchema);
export default SpellingAnalysis;
