import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const mapEvidenceSchema = new mongoose.Schema({
    mapEvidenceId: { type: String, required: true },
    studentId: { type: String, required: true },
    studentName: { type: String, required: true },
    grade: { type: Number, required: true },
    subject: { type: String, required: true },
    assessmentDate: { type: Date, default: null },
    term: { type: String, default: '' },
    ritScore: { type: Number, default: null },
    instructionalArea: { type: String, required: true },
    standardCode: { type: String, default: '' },
    standardDescription: { type: String, default: '' },
    performanceLevel: { type: String, default: '' }
}, { _id: false });

const mapTestRecordSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', default: null },
    academicYear: { type: String, required: true },
    importedStudentId: { type: String, default: '' },
    importedStudentName: { type: String, default: '' },
    importedGrade: { type: Number, default: null },
    importedSubject: { type: String, default: '' },
    mapEvidence: { type: [mapEvidenceSchema], default: [] },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sourceType: { type: String, enum: ['csv'], default: 'csv' },
    sourceFileRef: { type: String, default: null },
    sourceFileName: { type: String, required: true },
    sourceFileHash: { type: String, required: true },
    extractedText: { type: String, default: '' },
    testDate: { type: Date, default: null },
    testWindow: { type: String, enum: ['fall', 'winter', 'spring', 'other'], default: 'other' },
    ritScore: { type: Number, default: null },
    percentile: { type: Number, default: null },
    growthPercentile: { type: Number, default: null },
    goalAreas: [{ name: String, score: Number, raw: String }],
    domainScores: [{
        name: String,
        score: Number,
        raw: String,
        instructionalArea: String,
        instructionalAreaScore: Number,
        instructionalAreaStatus: { type: String, enum: ['relative_strength', 'suggested_focus', 'neutral'], default: 'neutral' },
        domain: String,
        scoreBand: String,
        skills: [String]
    }],
    skillResults: [{ code: String, name: String, score: Number, raw: String }],
    extractionStatus: { type: String, enum: ['uploaded', 'extracting', 'needs_review', 'confirmed', 'failed'], default: 'uploaded' },
    extractionConfidence: { type: Number, min: 0, max: 1, default: 0 },
    extractionError: { type: String, default: '' },
    teacherCorrections: [{ field: String, from: String, to: String, correctedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, correctedAt: Date }],
    confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    confirmedAt: { type: Date, default: null },
    preparationPlan: { type: mongoose.Schema.Types.ObjectId, ref: 'MapPrepPlan', default: null }
}, { timestamps: true });

mapTestRecordSchema.index({ school: 1, student: 1, academicYear: 1, createdAt: -1 });
mapTestRecordSchema.plugin(tenantIsolationPlugin);

export default mongoose.model('MapTestRecord', mapTestRecordSchema);
