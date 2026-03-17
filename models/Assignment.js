import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const assignmentSchema = new mongoose.Schema(
    {
        school: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'School',
            required: true,
            index: true
        },
        academicYear: {
            type: String,
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
        teacher: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Teacher',
            required: true,
            index: true
        },
        assignmentType: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'AssignmentType',
            required: true,
            index: true
        },
        assignmentTypeKey: {
            type: String,
            required: true,
            trim: true,
            lowercase: true
        },
        assignmentTypeName: {
            type: String,
            required: true,
            trim: true
        },
        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 200
        },
        instructions: {
            type: String,
            trim: true,
            maxlength: 5000,
            default: ''
        },
        assignedDate: {
            type: Date,
            default: Date.now
        },
        dueDate: {
            type: Date,
            default: null
        },
        status: {
            type: String,
            enum: ['draft', 'published', 'closed', 'archived'],
            default: 'draft',
            index: true
        },
        scope: {
            type: String,
            enum: ['class', 'selected_students'],
            default: 'class'
        },
        studentIds: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Student'
            }
        ],
        lessonPlanIds: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'LessonPlan'
            }
        ],
        maxMarks: {
            type: Number,
            required: true,
            min: 1,
            default: 10
        },
        allowLateSubmission: {
            type: Boolean,
            default: false
        },
        notifyOnAssign: {
            type: Boolean,
            default: true
        },
        notifyOnGrade: {
            type: Boolean,
            default: true
        },
        publishedAt: {
            type: Date,
            default: null
        },
        publishedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: null
        }
    },
    {
        timestamps: true
    }
);

assignmentSchema.index({ school: 1, class: 1, status: 1, dueDate: 1 });
assignmentSchema.index({ school: 1, teacher: 1, status: 1, assignedDate: -1 });
assignmentSchema.index({ school: 1, assignmentTypeKey: 1, status: 1, assignedDate: -1 });
assignmentSchema.index({ school: 1, academicYear: 1, class: 1, subject: 1 });
assignmentSchema.index({ school: 1, lessonPlanIds: 1 });

assignmentSchema.plugin(tenantIsolationPlugin);

const Assignment = mongoose.model('Assignment', assignmentSchema);

export default Assignment;
