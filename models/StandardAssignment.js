import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const standardAssignmentSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true
    },
    standard: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Standard',
        required: [true, 'Standard is required']
    },
    teacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Teacher',
        required: [true, 'Teacher is required']
    },
    class: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Class',
        required: [true, 'Class is required']
    },
    subject: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subject',
        required: [true, 'Subject is required']
    },
    // If empty, assignment applies to ALL students in the class
    students: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student'
    }],
    assignedDate: {
        type: Date,
        default: Date.now
    },
    dueDate: {
        type: Date
    },
    instructions: {
        type: String,
        trim: true
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Indexes
standardAssignmentSchema.index({ school: 1, teacher: 1 });
standardAssignmentSchema.index({ school: 1, class: 1 });
standardAssignmentSchema.index({ school: 1, standard: 1 });
standardAssignmentSchema.index({ school: 1, students: 1 });

// Apply tenant isolation plugin
standardAssignmentSchema.plugin(tenantIsolationPlugin);

const StandardAssignment = mongoose.model('StandardAssignment', standardAssignmentSchema);
export default StandardAssignment;
