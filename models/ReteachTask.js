import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const reteachTaskSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
        index: true
    },
    class: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Class',
        required: true,
        index: true
    },
    subject: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subject',
        required: true,
        index: true
    },
    objectiveKey: {
        type: String,
        required: true,
        trim: true,
        index: true
    },
    objectiveName: {
        type: String,
        default: '',
        trim: true
    },
    linkedLessons: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LessonPlan'
    }],
    reason: {
        type: String,
        required: true,
        trim: true
    },
    studentsTargeted: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student'
    }],
    recommendedStrategy: {
        type: String,
        default: '',
        trim: true
    },
    assignedTeacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Teacher',
        default: null,
        index: true
    },
    plannedDate: {
        type: Date,
        default: null
    },
    status: {
        type: String,
        enum: ['planned', 'in_progress', 'completed', 'cancelled'],
        default: 'planned',
        index: true
    },
    followUpAssessmentRef: {
        type: String,
        default: '',
        trim: true
    },
    linkedInterventionCase: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'InterventionCase',
        default: null
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, {
    timestamps: true
});

reteachTaskSchema.index({ school: 1, class: 1, subject: 1, status: 1, plannedDate: -1 });
reteachTaskSchema.plugin(tenantIsolationPlugin);

const ReteachTask = mongoose.model('ReteachTask', reteachTaskSchema);
export default ReteachTask;