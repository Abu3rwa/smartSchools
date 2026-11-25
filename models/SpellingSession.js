import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';
import { DEFAULT_SPELLING_EMAIL_AUDIENCE, SPELLING_EMAIL_AUDIENCES } from '../utils/spellingEmailSettings.js';

// Typed snapshot of the retest fields a teacher override must be able to
// restore. One shape is used for the original-answer snapshot and for the
// obligations a correction itself changed.
const retestStateSchema = new mongoose.Schema({
    retestItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'SpellingRetestItem', required: true },
    revision: { type: Number, required: true, min: 1 },
    lastEventSequence: { type: Number, default: null, min: 1 },
    status: { type: String, default: null },
    correctRetestStreak: { type: Number, default: 0 },
    incorrectRetestCount: { type: Number, default: 0 },
    dueAt: { type: Date, default: null },
    lastRetestedAt: { type: Date, default: null },
    practiceMasteredAt: { type: Date, default: null },
    practiceMasteredBySession: { type: mongoose.Schema.Types.ObjectId, ref: 'SpellingSession', default: null },
    resolvedAt: { type: Date, default: null },
    resolvedBySession: { type: mongoose.Schema.Types.ObjectId, ref: 'SpellingSession', default: null },
    suppressedAt: { type: Date, default: null },
    wordSnapshot: { type: String, default: null, maxlength: 200 },
    wordRevision: { type: Number, default: null, min: 1 }
}, { _id: false });

const spellingAttemptSchema = new mongoose.Schema({
    sequence: { type: Number, required: true, min: 1 },
    wordId: { type: mongoose.Schema.Types.ObjectId, ref: 'SpellingWord', required: true },
    wordSnapshot: { type: String, required: true, trim: true, maxlength: 200 },
    grade: { type: String, required: true, uppercase: true },
    week: { type: Number, required: true, min: 1 },
    category: { type: String, required: true, trim: true, maxlength: 120 },
    order: { type: Number, min: 1, default: null },
    retestItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'SpellingRetestItem', default: null },
    plannedWordIndex: { type: Number, min: 0, default: null },
    isRetest: { type: Boolean, default: false },
    correct: { type: Boolean, required: true },
    skipped: { type: Boolean, default: false },
    // The student's first answer is immutable evidence; an override records the
    // effective result separately so it can be undone by replay.
    originalCorrect: { type: Boolean, default: null },
    originalCountsAsMistake: { type: Boolean, default: null },
    // 0 marks an attempt recorded before correction provenance existed; such an
    // answer can only be overridden when no retest replay is required.
    provenanceVersion: { type: Number, default: 0, min: 0 },
    revision: { type: Number, default: 1, min: 1 },
    recordedSequence: { type: Number, default: null, min: 1 },
    retestSnapshot: { type: [retestStateSchema], default: [] },
    correctionHistory: [{
        revision: { type: Number, required: true, min: 1 },
        operationId: { type: String, default: null, trim: true, maxlength: 80 },
        actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        at: { type: Date, required: true },
        reason: { type: String, default: '', trim: true, maxlength: 500 },
        previousCorrect: { type: Boolean, required: true },
        newCorrect: { type: Boolean, required: true },
        action: { type: String, enum: ['correct', 'incorrect', 'undo'], required: true },
        targetCorrectionRevision: { type: Number, default: null, min: 1 },
        retestItemIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SpellingRetestItem' }], default: [] },
        policyVersion: { type: Number, default: 1, min: 1 }
    }],
    studentInput: { type: String, default: null, maxlength: 200 },
    normalizedInput: { type: String, default: null, maxlength: 200 },
    answeredAt: { type: Date, default: Date.now },
    answeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    correctedAt: { type: Date, default: null },
    correctedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    idempotencyKey: { type: String, required: true, trim: true, maxlength: 160 }
}, { _id: true, id: false });

const spellingSessionSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true
    },
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        required: true
    },
    mode: {
        type: String,
        enum: ['teacher-led', 'self-serve'],
        required: true
    },
    status: {
        type: String,
        enum: ['scheduled', 'in-progress', 'completed', 'abandoned'],
        default: 'in-progress'
    },
    scheduledAt: {
        type: Date,
        default: null
    },
    assessmentType: {
        type: String,
        enum: ['spelling-assessment', 'formal-spelling-test', 'retest-quiz'],
        default: 'spelling-assessment'
    },
    gradebookSubject: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subject',
        default: null
    },
    gradebookClass: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Class',
        default: null
    },
    gradebookAcademicYear: {
        type: String,
        trim: true,
        default: null
    },
    retestQuizItems: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SpellingRetestItem'
    }],
    formalTestWordList: [{
        wordId: { type: mongoose.Schema.Types.ObjectId, ref: 'SpellingWord', required: true },
        wordSnapshot: { type: String, required: true, trim: true, maxlength: 200 },
        grade: { type: String, enum: ['KG', 'G1', 'G2', 'G3', 'G4', 'G5'], required: true, uppercase: true },
        week: { type: Number, required: true, min: 1 },
        category: { type: String, required: true, trim: true, maxlength: 120 },
        order: { type: Number, min: 1, default: null },
        retestItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'SpellingRetestItem', default: null },
        isRetest: { type: Boolean, default: false }
    }],
    retestQuizKey: {
        type: String,
        default: undefined
    },
    maxMistakesAllowed: {
        type: Number,
        required: true,
        min: 1,
        max: 50
    },
    retestDeadline: {
        type: Date,
        required: true
    },
    retestIntervalDays: {
        type: Number,
        enum: [7, 30, 60],
        default: 7
    },
    curriculumGrade: {
        type: String,
        enum: ['KG', 'G1', 'G2', 'G3', 'G4', 'G5'],
        default: null
    },
    curriculumWeek: {
        type: Number,
        min: 1,
        default: null
    },
    startedAt: {
        type: Date,
        default: Date.now
    },
    completedAt: {
        type: Date,
        default: null
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    administeredBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    emailNotification: {
        type: String,
        enum: SPELLING_EMAIL_AUDIENCES,
        default: DEFAULT_SPELLING_EMAIL_AUDIENCE
    },
    passageEmailAudience: {
        type: String,
        enum: [...SPELLING_EMAIL_AUDIENCES, null],
        default: null
    },
    passageGeneration: {
        enabled: { type: Boolean, default: false },
        trigger: { type: String, enum: ['manual', 'automatic'], default: 'manual' },
        style: { type: String, enum: ['passage', 'sentence-list'], default: 'sentence-list' },
        requireTeacherApproval: { type: Boolean, default: true }
    },
    dictationMode: {
        enabled: { type: Boolean, default: false },
        autoPlayOnShow: { type: Boolean, default: true }
    },
    completionReason: {
        type: String,
        enum: ['mistake-limit', 'curriculum-exhausted', 'word-list-complete', 'teacher-ended', 'manual-complete', 'retest-quiz-complete'],
        default: null
    },
    nextSequence: {
        type: Number,
        default: 1,
        min: 1
    },
    currentItem: {
        wordId: { type: mongoose.Schema.Types.ObjectId, ref: 'SpellingWord', default: null },
        retestItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'SpellingRetestItem', default: null },
        plannedWordIndex: { type: Number, min: 0, default: null },
        sequence: { type: Number, default: null, min: 1 },
        // Saved content so serving, dictation and the staff console keep the
        // same text even if the library changes after this item was shown.
        word: { type: String, default: null, trim: true, maxlength: 200 },
        definition: { type: String, default: null, trim: true, maxlength: 2000 },
        grade: { type: String, default: null, uppercase: true },
        week: { type: Number, default: null, min: 1 },
        category: { type: String, default: null, trim: true, maxlength: 120 },
        order: { type: Number, default: null, min: 1 },
        wordRevision: { type: Number, default: null, min: 1 }
    },
    handRaise: {
        raisedAt: { type: Date, default: null },
        sequence: { type: Number, default: null, min: 1 }
    },
    correctCount: {
        type: Number,
        default: 0,
        min: 0
    },
    mistakeCount: {
        type: Number,
        default: 0,
        min: 0
    },
    emailStatus: {
        type: String,
        enum: ['pending', 'sent', 'failed', 'not-applicable'],
        default: 'pending'
    },
    emailSentAt: {
        type: Date,
        default: null
    },
    emailAttempts: {
        type: Number,
        default: 0,
        min: 0
    },
    emailError: {
        type: String,
        default: null
    },
    retestEmailStatus: {
        type: String,
        enum: ['pending', 'sent', 'failed', 'not-applicable'],
        default: null
    },
    attempts: {
        type: [spellingAttemptSchema],
        default: []
    },
    revision: { type: Number, default: 1, min: 1 },
    snapshotSchemaVersion: { type: Number, default: 0, min: 0 },
    snapshotGrades: { type: [String], default: [] },
    snapshotLibraryVersions: [{
        grade: { type: String, required: true, uppercase: true },
        version: { type: Number, required: true, min: 1 }
    }]
}, {
    timestamps: true
});

spellingSessionSchema.index({ school: 1, student: 1, status: 1, startedAt: -1 });
spellingSessionSchema.index({ school: 1, createdAt: -1 });
spellingSessionSchema.index(
    { school: 1, student: 1, retestQuizKey: 1 },
    {
        unique: true,
        partialFilterExpression: { retestQuizKey: { $type: 'string' } },
        name: 'school_student_retest_quiz_key_unique'
    }
);
spellingSessionSchema.index({ school: 1, student: 1, 'handRaise.raisedAt': 1 }, { partialFilterExpression: { 'handRaise.raisedAt': { $type: 'date' } } });
spellingSessionSchema.plugin(tenantIsolationPlugin);

const SpellingSession = mongoose.model('SpellingSession', spellingSessionSchema);
export default SpellingSession;
