import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const weakObjectiveSchema = new mongoose.Schema({
    objectiveKey: { type: String, required: true, trim: true },
    objectiveName: { type: String, default: '', trim: true },
    masteryRate: { type: Number, default: 0 },
    studentsBelowMastery: { type: Number, default: 0 },
    suggestedAction: { type: String, default: 'practice', trim: true }
}, { _id: false });

const assessmentReflectionSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
        index: true
    },
    assessmentGroupId: {
        type: String,
        required: true,
        trim: true,
        index: true
    },
    teacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    weakObjectives: {
        type: [weakObjectiveSchema],
        default: []
    },
    whatWorked: {
        type: String,
        default: '',
        trim: true
    },
    whatDidNotWork: {
        type: String,
        default: '',
        trim: true
    },
    reteachPlan: {
        type: String,
        default: '',
        trim: true
    },
    notes: {
        type: String,
        default: '',
        trim: true
    }
}, {
    timestamps: true
});

assessmentReflectionSchema.index({ school: 1, assessmentGroupId: 1, teacher: 1 }, { unique: true });
assessmentReflectionSchema.plugin(tenantIsolationPlugin);

const AssessmentReflection = mongoose.model('AssessmentReflection', assessmentReflectionSchema);
export default AssessmentReflection;