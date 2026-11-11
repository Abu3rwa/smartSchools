import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

/*
 * One teacher-triggered analysis of a student's submitted writing against the
 * school's standards. Everything needed to explain a proposed level later is
 * frozen here: which pieces were used, the standard text at run time, and the
 * verbatim evidence behind each judgement. Nothing here is produced by a
 * student-facing request and nothing in it is student-visible.
 */

const standardSnapshotSchema = new mongoose.Schema(
    {
        standard: { type: mongoose.Schema.Types.ObjectId, ref: 'Standard', required: true },
        code: { type: String, trim: true, default: '' },
        name: { type: String, trim: true, default: '' },
        description: { type: String, trim: true, default: '' },
        category: { type: String, trim: true, default: '' },
        gradeLevel: { type: Number, default: null }
    },
    { _id: false }
);

const pieceSchema = new mongoose.Schema(
    {
        draft: { type: mongoose.Schema.Types.ObjectId, ref: 'WritingDraft', required: true },
        project: { type: mongoose.Schema.Types.ObjectId, ref: 'WritingProject' },
        assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'WritingAssignment' },
        title: { type: String, trim: true, default: '' },
        writingType: { type: String, trim: true, default: '' },
        submittedAt: { type: Date, default: null },
        totalWords: { type: Number, default: 0 },
        truncated: { type: Boolean, default: false }
    },
    { _id: false }
);

const excludedPieceSchema = new mongoose.Schema(
    {
        draft: { type: mongoose.Schema.Types.ObjectId, ref: 'WritingDraft' },
        project: { type: mongoose.Schema.Types.ObjectId, ref: 'WritingProject' },
        title: { type: String, trim: true, default: '' },
        submittedAt: { type: Date, default: null },
        totalWords: { type: Number, default: 0 },
        reason: { type: String, trim: true, default: '' }
    },
    { _id: false }
);

const pieceRunSchema = new mongoose.Schema(
    {
        draft: { type: mongoose.Schema.Types.ObjectId, ref: 'WritingDraft', required: true },
        aiStatus: {
            type: String,
            enum: ['pending', 'running', 'done', 'failed', 'unusable'],
            default: 'pending'
        },
        error: { type: String, trim: true, default: '' },
        quotesDropped: { type: Number, default: 0 },
        quotesKept: { type: Number, default: 0 },
        vagueNotes: { type: Number, default: 0 },
        tokens: { type: Number, default: 0 },
        costCents: { type: Number, default: 0 },
        // Normalised evidence for this piece, kept so a retry and the review
        // screen never have to call the model again for a successful piece.
        evidence: {
            standards: { type: [mongoose.Schema.Types.Mixed], default: [] },
            patterns: { type: [mongoose.Schema.Types.Mixed], default: [] }
        }
    },
    { _id: false }
);

const evidenceRowSchema = new mongoose.Schema(
    {
        draft: { type: mongoose.Schema.Types.ObjectId, ref: 'WritingDraft', required: true },
        submittedAt: { type: Date, default: null },
        opportunity: { type: Boolean, default: false },
        absence: { type: Boolean, default: false },
        judgment: {
            type: String,
            enum: ['met', 'partly', 'not_met', 'none'],
            default: 'none'
        },
        quote: { type: String, trim: true, default: '' },
        note: { type: String, trim: true, default: '' },
        teacherOverridden: { type: Boolean, default: false }
    },
    { _id: false }
);

const standardResultSchema = new mongoose.Schema(
    {
        standard: { type: mongoose.Schema.Types.ObjectId, ref: 'Standard', required: true },
        code: { type: String, trim: true, default: '' },
        name: { type: String, trim: true, default: '' },
        category: { type: String, trim: true, default: '' },
        pieces: { type: [evidenceRowSchema], default: [] },
        counts: {
            applicable: { type: Number, default: 0 },
            met: { type: Number, default: 0 },
            partly: { type: Number, default: 0 },
            notMet: { type: Number, default: 0 }
        },
        status: {
            type: String,
            enum: ['not_observed', 'insufficient_evidence', 'fragile', 'developing', 'consistent', 'transfer'],
            default: 'not_observed'
        },
        proposedLevel: { type: Number, min: 0, max: 4, default: null },
        teacherLevel: { type: Number, min: 0, max: 4, default: null },
        teacherNote: { type: String, trim: true, default: '', maxlength: 600 }
    },
    { _id: false }
);

const patternSchema = new mongoose.Schema(
    {
        category: { type: String, trim: true, default: '' },
        kind: { type: String, enum: ['strength', 'issue'], default: 'issue' },
        pieces: { type: Number, default: 0 },
        recurring: { type: Boolean, default: false },
        notes: { type: [String], default: [] },
        quotes: { type: [String], default: [] }
    },
    { _id: false }
);

const writingAnalysisSchema = new mongoose.Schema(
    {
        school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
        student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
        class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
        subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
        academicYear: { type: String, trim: true, default: '' },
        language: { type: String, enum: ['en', 'ar'], default: 'en' },
        from: { type: Date, default: null },
        to: { type: Date, default: null },
        status: {
            type: String,
            enum: ['pending', 'running', 'done', 'done_with_warnings', 'failed'],
            default: 'pending'
        },
        aiError: { type: String, trim: true, default: '' },
        runBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        modelUsed: { type: String, trim: true, default: '' },
        costCents: { type: Number, default: 0 },
        scopeHash: { type: String, trim: true, default: '' },
        standardSnapshot: { type: [standardSnapshotSchema], default: [] },
        draftSelection: { type: [pieceSchema], default: [] },
        excludedPieces: { type: [excludedPieceSchema], default: [] },
        pieceRuns: { type: [pieceRunSchema], default: [] },
        standards: { type: [standardResultSchema], default: [] },
        patterns: { type: [patternSchema], default: [] },
        growth: { type: mongoose.Schema.Types.Mixed, default: {} },
        summary: { type: mongoose.Schema.Types.Mixed, default: {} },
        teacherEdits: {
            type: [{
                by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
                at: { type: Date },
                note: { type: String, trim: true, default: '' }
            }],
            default: []
        },
        publish: {
            state: { type: String, enum: ['draft', 'published'], default: 'draft' },
            by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
            at: { type: Date, default: null },
            grades: {
                type: [{
                    standard: { type: mongoose.Schema.Types.ObjectId, ref: 'Standard' },
                    manualScore: { type: Number },
                    previousManualScore: { type: Number, default: null },
                    entry: { type: mongoose.Schema.Types.ObjectId, ref: 'StandardsGradebookEntry' }
                }],
                default: []
            }
        },
        supersedes: { type: mongoose.Schema.Types.ObjectId, ref: 'WritingAnalysis', default: null },
        isCurrent: { type: Boolean, default: true }
    },
    { timestamps: true }
);

writingAnalysisSchema.index({ school: 1, student: 1, createdAt: -1 });
writingAnalysisSchema.index({ school: 1, class: 1, createdAt: -1 });
writingAnalysisSchema.plugin(tenantIsolationPlugin);

const WritingAnalysis = mongoose.model('WritingAnalysis', writingAnalysisSchema);
export default WritingAnalysis;
